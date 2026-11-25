/**
 * LookPanel: Lookback's side panel (BUILD_SPEC §6.13), 300×520, 24 left of the video.
 *
 * I (no takes): one big "Record lookback" button filling the panel (an 80 pink + circle over the label).
 * L: the selected take's card (2 px white border, NEW on the newest take
 * just recorded, "TAKE n · 0.75×", an 80 play circle and "Play side by side") and the takes row under it: 1–3 numbered
 * buttons (the selected one white) and a pink +.
 * L2 (four or more takes): the row is ‹ · "n / total" · › · +, with ‹ and › greyed at the ends.
 * Pinching the card calls onPlay, a take button onSelect with its index, ‹ › onStep, and Record lookback or + onRecord.
 * A failed recording's message sits under the card's label (or the button's).
 * A shallow view: render() shows the Lookback view, placed by the screen's lookPanel in Layout.SCREENS; hidden elsewhere.
 * Switching into Lookback, it fades in 450–750 ms after the tap from 24 px to the right; switching out, it fades out
 * over the first 100 ms with the mode panel's old controls (BUILD_SPEC §6.8a). It ignores pinches while it fades.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { LookbackView, takeLabel } from "../Core/LookbackController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { Mode, ViewState } from "../Core/PlaybackController"
import { MODE_SWITCH, progress } from "./ModeSwitch"
import { ColorToken, RADIUS, SIZE, SPACE, TextStyleName } from "./Theme"
import { addHover, childObject, GroupFade, Icon, makeIcon, makePill, makeSurface, makeText, place, setRectSize, setSurfaceBorder, themeColor } from "./Visuals"

// Layers in front of the window plane, in cm: the panel, the buttons and card, then what sits on them.
const Z_PANEL = 0.1
const Z_ITEM = 0.2
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
const PAD = SPACE.attached
const BIG_CIRCLE = 80
const CHIP_INSET = 12
const CHIP_PAD = 16
// Chip text (Sora 14/700, capitals) is about this wide per character.
const CHIP_CHAR_W = 10
const COUNT_W = 64
// How many characters of a failure message fit across the card.
const NOTE_CHARS = 30

/** Breaks text into lines of at most `max` characters, at spaces. */
function wrapLines(text: string, max: number): string {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.join("\n")
}

interface Label {
  object: SceneObject
  text: Text
}

/** A round 56 button: its object, fill, a number label and an optional icon. */
interface RoundButton {
  object: SceneObject
  rect: RoundedRectangle
  label: Label
  icon: Icon | null
}

@component
export class LookPanel extends BaseScriptComponent {
  /** Called when a take button is pinched, with the take's index in the section's takes. */
  onSelect: (index: number) => void = () => {}
  /** Called when ‹ (-1) or › (+1) is pinched. */
  onStep: (delta: -1 | 1) => void = () => {}
  /** Called when Record lookback or the + is pinched. */
  onRecord: () => void = () => {}
  /** Called when the take card is pinched. */
  onPlay: () => void = () => {}

  private look: SceneObject
  private lookRect: RoundedRectangle
  private bigRect: RoundedRectangle
  private bigButton: SceneObject
  private bigNote: Label
  private card: SceneObject
  private cardRect: RoundedRectangle
  private newPill: SceneObject
  private newRect: RoundedRectangle
  private takePill: SceneObject
  private takePillRect: RoundedRectangle
  private takePillLabel: Label
  private cardNote: Label
  private row: SceneObject
  private takeButtons: RoundButton[] = []
  private back: RoundButton
  private forward: RoundButton
  private counter: Label
  private plus: RoundButton
  private layoutKey = ""
  private lastKey = ""
  // The takes the buttons stand for, and what ‹ › may do now.
  private takeCount = 0
  private canBack = false
  private canForward = false
  // The mode at the last render, and the fade in or out of a mode switch under way.
  private lastMode: Mode | null = null
  private fade: { start: number; entering: boolean; group: GroupFade } | null = null

  onAwake() {
    this.look = childObject("Look", this.sceneObject)
    this.lookRect = makeSurface(this.look, { fill: "panelSolid", border: "border", borderPx: 1, radius: RADIUS.xl }, 1, 300, 520)

    // I: one big button filling the panel.
    this.bigButton = this.pressable("Record", this.look, 300 - 2 * PAD, 520 - 2 * PAD, () => this.onRecord())
    this.bigRect = makeSurface(this.bigButton, { fill: "control", radius: RADIUS.lg }, 2, 300 - 2 * PAD, 520 - 2 * PAD)
    addHover(this.bigButton, this.bigRect)
    // In front of the panel behind it: two surfaces at the same depth z-fight.
    this.bigButton.getTransform().setLocalPosition(new vec3(0, 0, Z_ITEM))
    const circle = childObject("Circle", this.bigButton)
    makePill(circle, "pink", 3, BIG_CIRCLE, BIG_CIRCLE)
    // The circle, 16 gap and the label (24) are centred as one group: 120 tall.
    place(circle, new vec2(0, pxToCm(20)), Z_LABEL)
    const plusIcon = makeIcon(circle, "plus", "onColor", 4, 40)
    plusIcon.object.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
    const bigLabel = this.label(this.bigButton, "buttonStrong", "text")
    bigLabel.text.text = "Record lookback"
    place(bigLabel.object, new vec2(0, -pxToCm(48)), Z_LABEL)
    this.bigNote = this.label(this.bigButton, "caption", "textMuted")
    place(this.bigNote.object, new vec2(0, -pxToCm(80)), Z_LABEL)

    // L: the card and the takes row (no header: the card starts at the panel's top).
    this.card = this.pressable("Card", this.look, 1, 1, () => this.onPlay())
    this.cardRect = makeSurface(this.card, { fill: "control", border: "text", borderPx: 2, radius: RADIUS.lg }, 2, 1, 1)
    addHover(this.card, this.cardRect)
    this.newPill = childObject("New", this.card)
    this.newRect = makePill(this.newPill, "text", 3, 1, SIZE.chip)
    this.label(this.newPill, "chip", "onColor").text.text = "NEW"
    this.takePill = childObject("TakePill", this.card)
    this.takePillRect = makePill(this.takePill, "scrim", 3, 1, SIZE.chip)
    this.takePillLabel = this.label(this.takePill, "chip", "text")
    const playCircle = childObject("PlayCircle", this.card)
    makePill(playCircle, "text", 3, BIG_CIRCLE, BIG_CIRCLE)
    place(playCircle, new vec2(0, 0), Z_ITEM)
    const playIcon = makeIcon(playCircle, "play", "onColor", 4, 28)
    playIcon.object.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
    const playLabel = this.label(this.card, "buttonStrong", "text")
    playLabel.text.text = "Play side by side"
    place(playLabel.object, new vec2(0, -pxToCm(BIG_CIRCLE / 2 + 12 + 12)), Z_ITEM)
    this.cardNote = this.label(this.card, "caption", "textMuted")
    place(this.cardNote.object, new vec2(0, -pxToCm(BIG_CIRCLE / 2 + 12 + 24 + 12 + 14)), Z_ITEM)

    this.row = childObject("Takes", this.look)
    for (let i = 0; i < 3; i++) this.takeButtons.push(this.roundButton(`Take${i}`, null, () => this.takeCount > i && this.onSelect(i)))
    this.back = this.roundButton("Back", "back", () => this.canBack && this.onStep(-1))
    this.forward = this.roundButton("Forward", "forward", () => this.canForward && this.onStep(1))
    this.counter = this.label(this.row, "buttonCount", "text")
    this.plus = this.roundButton("Plus", "plus", () => this.onRecord())
    this.plus.rect.backgroundColor = themeColor("pink")
    this.plus.icon!.setColor("onColor")
    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.animate())
  }

  render(view: ViewState, look: LookbackView | null) {
    const { lookPanel } = panelsFor(view)
    const show = !!lookPanel && !!look
    const was = this.sceneObject.enabled && !(this.fade && !this.fade.entering)
    const switched = this.lastMode !== null && this.lastMode !== view.mode
    this.lastMode = view.mode
    if (switched && was && !show) this.startFade(false)
    else if (switched && !was && show) this.startFade(true)
    else if (show && this.fade && !this.fade.entering) this.endFade()
    if (!show) {
      // Hidden, unless it's fading out.
      if (!this.fade) this.sceneObject.enabled = false
      return
    }
    this.sceneObject.enabled = true
    this.renderView(lookPanel!, look!)
    this.animate()
  }

  private startFade(entering: boolean) {
    this.endFade()
    this.fade = { start: getTime(), entering, group: new GroupFade([this.sceneObject]) }
  }

  /** One frame of the fade: entering, held clear until 450 ms then in from 24 px right; leaving, out over 100 ms. */
  private animate() {
    const f = this.fade
    if (!f) return
    const ms = (getTime() - f.start) * 1000
    const k = f.entering ? progress(ms, MODE_SWITCH.takesIn) : 1 - progress(ms, MODE_SWITCH.out)
    f.group.apply(k)
    const shift = f.entering ? pxToCm(MODE_SWITCH.takesShift) * (1 - k) : 0
    this.sceneObject.getTransform().setLocalPosition(new vec3(shift, 0, 0))
    if (ms >= (f.entering ? MODE_SWITCH.takesIn.end : MODE_SWITCH.out.end)) {
      this.endFade()
      if (!f.entering) this.sceneObject.enabled = false
    }
  }

  private endFade() {
    if (!this.fade) return
    this.fade.group.finish()
    this.fade = null
    this.sceneObject.getTransform().setLocalPosition(vec3.zero())
  }

  private renderView(lookPanel: PxRect, look: LookbackView) {
    const hasTakes = look.takes.length > 0
    const layoutKey = `${lookPanel[3]}|${hasTakes}|${look.stepper}|${hasTakes && !look.stepper ? look.takes.length : 0}`
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey
      // The layout moves the take pill, which the text pass places by its width.
      this.lastKey = ""
      this.layout(lookPanel, look, hasTakes)
    }
    const key = `${look.section}|${look.selected}|${look.takes.length}|${look.newTake}|${look.message}|${look.canBack}|${look.canForward}`
    if (key === this.lastKey) return
    this.lastKey = key
    const n = look.takes.length
    this.takeCount = look.stepper ? 0 : n
    this.canBack = look.stepper && look.canBack
    this.canForward = look.stepper && look.canForward
    const note = look.message ? wrapLines(look.message, NOTE_CHARS) : ""
    this.bigNote.text.text = note
    this.cardNote.text.text = note
    const selected = look.selected >= 0 ? look.takes[look.selected] : null
    if (selected) {
      const isNew = selected.name === look.newTake && look.selected === n - 1
      this.newPill.enabled = isNew
      this.takePillLabel.text.text = takeLabel(selected)
      this.sizeChip(this.takePillRect, this.takePill, takeLabel(selected), CHIP_INSET, false)
      this.counter.text.text = `${look.selected + 1} / ${n}`
    }
    this.takeButtons.forEach((b, i) => {
      const take = look.takes[i]
      if (!take || look.stepper) return
      const on = i === look.selected
      b.label.text.text = `${take.number}`
      b.rect.backgroundColor = themeColor(on ? "text" : "control")
      b.label.text.textFill.color = themeColor(on ? "onColor" : "text")
    })
    this.back.icon!.setColor(look.canBack ? "text" : "tickOff")
    this.forward.icon!.setColor(look.canForward ? "text" : "tickOff")
  }

  /** Places the panel's parts for I, L (one to three takes) or L2. */
  private layout(box: PxRect, look: LookbackView, hasTakes: boolean) {
    const [, , w, h] = box
    place(this.look, pointInPanelCm(box, w / 2, h / 2), Z_PANEL)
    // As tall as the video beside it, which is shorter now that the section tiles sit under both.
    setRectSize(this.lookRect, w, h, RADIUS.xl)
    setRectSize(this.bigRect, w - 2 * PAD, h - 2 * PAD, RADIUS.lg)
    this.setHitBox(this.bigButton, w - 2 * PAD, h - 2 * PAD)
    this.bigButton.enabled = !hasTakes
    this.card.enabled = hasTakes
    this.row.enabled = hasTakes
    if (!hasTakes) return
    const top = h / 2 - PAD
    // The card fills what's between the panel's top and the takes row.
    const cardW = w - 2 * PAD
    const cardTop = top
    const rowTop = -h / 2 + PAD + SIZE.control
    const cardBottom = rowTop + SPACE.between
    const cardH = cardTop - cardBottom
    place(this.card, new vec2(0, pxToCm((cardTop + cardBottom) / 2)), Z_ITEM)
    setRectSize(this.cardRect, cardW, cardH, RADIUS.lg)
    setSurfaceBorder(this.cardRect, "text", 2)
    this.setHitBox(this.card, cardW, cardH)
    // NEW top-left and the take's label bottom-left, 12 in.
    this.sizeChip(this.newRect, this.newPill, "NEW", CHIP_INSET, true)
    place(this.newPill, new vec2(-pxToCm(cardW / 2 - CHIP_INSET - this.chipWidth("NEW") / 2), pxToCm(cardH / 2 - CHIP_INSET - SIZE.chip / 2)), Z_LABEL)
    this.takePill.getTransform().setLocalPosition(new vec3(0, -pxToCm(cardH / 2 - CHIP_INSET - SIZE.chip / 2), Z_LABEL))
    // The takes row: centred, 12 between controls.
    const y = pxToCm(rowTop - SIZE.control / 2)
    const items: { object: SceneObject; w: number }[] = look.stepper
      ? [
          { object: this.back.object, w: SIZE.control },
          { object: this.counter.object, w: COUNT_W },
          { object: this.forward.object, w: SIZE.control },
          { object: this.plus.object, w: SIZE.control },
        ]
      : [...this.takeButtons.slice(0, look.takes.length).map((b) => ({ object: b.object, w: SIZE.control })), { object: this.plus.object, w: SIZE.control }]
    const every = [...this.takeButtons.map((b) => b.object), this.back.object, this.forward.object, this.counter.object, this.plus.object]
    every.forEach((o) => (o.enabled = items.some((i) => i.object === o)))
    const total = items.reduce((sum, i) => sum + i.w, 0) + SPACE.between * (items.length - 1)
    let x = -total / 2
    for (const item of items) {
      place(item.object, new vec2(pxToCm(x + item.w / 2), y), Z_ITEM)
      x += item.w + SPACE.between
    }
  }

  /** The width a chip's text needs, with its 16 padding either side. */
  private chipWidth(text: string): number {
    return 2 * CHIP_PAD + text.length * CHIP_CHAR_W
  }

  /** Sizes a pill to its text; `leftAnchored` pills are placed by the caller from their centre, the take pill hangs off the card's left edge. */
  private sizeChip(rect: RoundedRectangle, object: SceneObject, text: string, inset: number, leftAnchored: boolean) {
    const w = this.chipWidth(text)
    setRectSize(rect, w, SIZE.chip, RADIUS.pill)
    if (leftAnchored) return
    // The label sits 12 in from the card's left edge and bottom.
    const cardW = 300 - 2 * PAD
    const pos = object.getTransform().getLocalPosition()
    object.getTransform().setLocalPosition(new vec3(-pxToCm(cardW / 2 - inset - w / 2), pos.y, pos.z))
  }

  /** A 56 round button with an optional icon, pressable with onPress. */
  private roundButton(name: string, icon: "back" | "forward" | "plus" | null, onPress: () => void): RoundButton {
    const object = this.pressable(name, this.row, SIZE.control, SIZE.control, onPress)
    const rect = makePill(object, "control", 2, SIZE.control, SIZE.control)
    addHover(object, rect)
    const label = this.label(object, "buttonCount", "text")
    let glyph: Icon | null = null
    if (icon) {
      glyph = makeIcon(object, icon, "text", 3)
      glyph.object.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
    }
    return { object, rect, label, icon: glyph }
  }

  /** A pressable object with a collider of the given size (px), calling onPress when pinched. */
  private pressable(name: string, parent: SceneObject, wPx: number, hPx: number, onPress: () => void): SceneObject {
    const so = childObject(name, parent)
    const collider = so.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    this.setHitBox(so, wPx, hPx)
    const interactable = so.createComponent(Interactable.getTypeName()) as Interactable
    // Not while it fades in or out with a mode switch.
    interactable.onTriggerEnd.add(() => !this.fade && onPress())
    return so
  }

  private setHitBox(object: SceneObject, wPx: number, hPx: number) {
    const collider = object.getComponent("ColliderComponent") as ColliderComponent
    if (!collider) return
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
    collider.shape = shape
  }

  private label(parent: SceneObject, style: TextStyleName, token: ColorToken, align: "left" | "center" | "right" = "center"): Label {
    const object = childObject("Label", parent)
    object.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
    return { object, text: makeText(object, style, token, 5, align) }
  }
}
