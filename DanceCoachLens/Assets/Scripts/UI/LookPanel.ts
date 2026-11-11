/**
 * LookPanel: Lookback's look panel and ATTEMPTS row (screens I and L).
 *
 * I (no takes): "LOOKBACK · SECTION n · 0 TAKES" over a "Record lookback" button (pinching it calls onRecord),
 * with "No recordings for this section yet" under it.
 * L (takes): the selected take's tile, "TAKE n · 0.75×" on it, over a "Play side by side" button
 * (pinching it calls onPlay). The ATTEMPTS row ("SECTION n · LOCKED") shows the last four
 * takes, newest on the right, and a + (it calls onRecord too); pinching a take calls onSelect with its place in the row.
 * The take just recorded is tagged NEW, and a failed recording leaves its message under the buttons.
 * A shallow view: render() shows the Lookback view, placed by the screen's lookPanel and attempts panels in Layout.SCREENS.
 * Hidden on screens without them.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ATTEMPTS_SHOWN, LookbackView, takeLabel } from "../Core/LookbackController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { ViewState } from "../Core/PlaybackController"
import { ColorToken, RADII, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

// Layers in front of the window plane, in cm: the panels, then what sits on them.
const Z_PANEL = 0.1
const Z_ITEM = 0.2
const RECORD = { w: 220, h: 64 }
const PLAY = { w: 200, h: 56 }
const PLUS = 36
// Collider depth, in cm.
const HIT_DEPTH = 1
// The ATTEMPTS row, from its left edge (prototype px): where the takes start, the + button's width and the gap between takes.
const ATTEMPTS_X = 124
const PLUS_W = 52
const CHIP_GAP = 6
const TILE_PAD = 12

// How many characters of the note fit across the look panel.
const NOTE_CHARS = 34

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

interface Chip {
  object: SceneObject
  rect: RoundedRectangle
  label: Label
}

@component
export class LookPanel extends BaseScriptComponent {
  /** Called when a take in the ATTEMPTS row is pinched, with its place in the row (0 is the oldest shown). */
  onSelect: (attempt: number) => void = () => {}
  /** Called when Record lookback or the + is pinched. */
  onRecord: () => void = () => {}
  /** Called when Play side by side is pinched. */
  onPlay: () => void = () => {}

  private look: SceneObject
  private lookRect: RoundedRectangle
  private head: Label
  private count: Label
  private note: Label
  private record: SceneObject
  private tile: SceneObject
  private tileRect: RoundedRectangle
  private tileLabel: Label
  private play: SceneObject
  private attempts: SceneObject
  private attemptsRect: RoundedRectangle
  private attemptsLabel: Label
  private chips: Chip[] = []
  private plus: SceneObject
  private lookKey = ""
  private attemptsKey = ""
  private lastKey = ""
  // How many takes the row shows; a pinch on a chip past it does nothing.
  private shown = 0

  onAwake() {
    this.look = childObject("Look", this.sceneObject)
    this.lookRect = this.panel(this.look)
    this.head = this.label(this.look, TYPE.chip, "muted", "left")
    this.count = this.label(this.look, TYPE.chip, "muted", "right")
    this.note = this.label(this.look, TYPE.button, "muted")
    this.record = this.outlined("Record", this.look, RECORD.w, RECORD.h, RADII.control, () => this.onRecord())
    this.label(this.record, TYPE.button, "ink").text.text = "Record lookback"
    this.tile = childObject("Tile", this.look)
    this.tileRect = makeRect(this.tile, "video", 2)
    this.tileRect.border = true
    this.tileRect.borderSize = pxToCm(2)
    this.tileRect.borderColor = themeColor("ink")
    this.tileLabel = this.label(this.tile, TYPE.chip, "ink", "left")
    this.play = this.outlined("Play", this.look, PLAY.w, PLAY.h, RADII.control, () => this.onPlay())
    this.label(this.play, TYPE.button, "ink").text.text = "Play side by side"

    this.attempts = childObject("Attempts", this.sceneObject)
    this.attemptsRect = this.panel(this.attempts)
    this.attemptsLabel = this.label(this.attempts, TYPE.chip, "muted", "left")
    for (let i = 0; i < ATTEMPTS_SHOWN; i++) this.chips.push(this.chip(i))
    this.plus = this.outlined("Plus", this.attempts, PLUS, PLUS, PLUS / 2, () => this.onRecord())
    this.label(this.plus, TYPE.icon, "ink").text.text = "+"
    this.sceneObject.enabled = false
  }

  render(view: ViewState, look: LookbackView | null) {
    const { lookPanel, attempts } = panelsFor(view)
    this.sceneObject.enabled = !!lookPanel && !!attempts && !!look
    if (!lookPanel || !attempts || !look) return
    const [, , lw, lh] = lookPanel
    const [, , aw, ah] = attempts
    const hasTakes = look.takes.length > 0
    const lookKey = `${lw}x${lh}|${hasTakes}`
    if (lookKey !== this.lookKey) {
      this.lookKey = lookKey
      this.layoutLook(lookPanel, hasTakes)
    }
    const attemptsKey = `${aw}x${ah}|${look.attempts.length}`
    if (attemptsKey !== this.attemptsKey) {
      this.attemptsKey = attemptsKey
      this.layoutAttempts(attempts, look.attempts.length)
    }
    const n = look.takes.length
    const key = `${look.section}|${look.selected}|${look.newTake}|${look.message}|${look.attempts.map((t) => t.name).join(",")}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.head.text.text = `LOOKBACK · SECTION ${look.section}`
    this.count.text.text = `${n} TAKE${n === 1 ? "" : "S"}`
    // A failed recording's message takes the note's place, on L too.
    this.note.object.enabled = !hasTakes || !!look.message
    this.note.text.text = look.message ? wrapLines(look.message, NOTE_CHARS) : "No recordings for this section yet"
    this.attemptsLabel.text.text = `ATTEMPTS   SECTION ${look.section} · LOCKED`
    const selected = look.selected >= 0 ? look.takes[look.selected] : null
    this.tileLabel.text.text = selected ? takeLabel(selected, selected.name === look.newTake) : ""
    this.shown = look.attempts.length
    this.chips.forEach((chip, i) => {
      const take = look.attempts[i]
      chip.object.enabled = !!take
      if (!take) return
      const isSelected = look.takes[look.selected] === take
      // NEW goes under the label: the chip is too narrow for it beside.
      chip.label.text.text = take.name === look.newTake ? `${takeLabel(take)}\nNEW` : takeLabel(take)
      chip.label.text.textFill.color = themeColor(isSelected ? "ink" : "ink2")
      chip.rect.backgroundColor = themeColor(isSelected ? "video" : "panel")
      chip.rect.borderColor = themeColor(isSelected ? "ink" : "soft")
      chip.rect.borderSize = pxToCm(isSelected ? 2 : 1)
    })
  }

  /** Places the look panel's parts: the Record button and note with no takes, the tile and Play button with some. */
  private layoutLook(box: PxRect, hasTakes: boolean) {
    const [, , w, h] = box
    place(this.look, pointInPanelCm(box, w / 2, h / 2), Z_PANEL)
    setRectSize(this.lookRect, w, h, RADII.video)
    this.head.object.getTransform().setLocalPosition(new vec3(-pxToCm(w / 2 - TILE_PAD), pxToCm(h / 2 - 20), Z_ITEM))
    this.count.object.getTransform().setLocalPosition(new vec3(pxToCm(w / 2 - TILE_PAD), pxToCm(h / 2 - 20), Z_ITEM))
    this.record.enabled = !hasTakes
    this.tile.enabled = hasTakes
    this.play.enabled = hasTakes
    this.record.getTransform().setLocalPosition(new vec3(0, 0, Z_ITEM))
    // The note sits under the Record button, or, on L, under the Play button.
    this.note.object.getTransform().setLocalPosition(new vec3(0, hasTakes ? pxToCm(h / 2 - 36 - (h - 36 - 56) - 56 - PLAY.h / 2 - 22) : -pxToCm(RECORD.h / 2 + 24), Z_ITEM))
    // The tile fills the panel under the heading, leaving room for the Play button below its middle.
    const tileW = w - 2 * TILE_PAD
    const tileH = h - 36 - 56
    this.tile.getTransform().setLocalPosition(new vec3(0, pxToCm(h / 2 - 36 - tileH / 2), Z_ITEM / 2))
    setRectSize(this.tileRect, tileW, tileH, 10)
    this.tileLabel.object.getTransform().setLocalPosition(new vec3(-pxToCm(tileW / 2 - 8), -pxToCm(tileH / 2 - 14), Z_ITEM / 2))
    this.play.getTransform().setLocalPosition(new vec3(0, pxToCm(h / 2 - 36 - tileH / 2 - 56), Z_ITEM))
  }

  /** Places the ATTEMPTS row: its label, then `n` takes sharing the room left of the + button. */
  private layoutAttempts(box: PxRect, n: number) {
    const [, , w, h] = box
    place(this.attempts, pointInPanelCm(box, w / 2, h / 2), Z_PANEL)
    setRectSize(this.attemptsRect, w, h, RADII.bar)
    this.attemptsLabel.object.getTransform().setLocalPosition(new vec3(-pxToCm(w / 2 - 20), 0, Z_ITEM))
    const room = w - 12 - ATTEMPTS_X - PLUS_W
    const chipW = n ? (room - CHIP_GAP * n) / n : 0
    const chipH = h - 12
    this.chips.forEach((chip, i) => {
      setRectSize(chip.rect, chipW, chipH, 8)
      this.setHitBox(chip.object, chipW, chipH)
      chip.object.getTransform().setLocalPosition(new vec3(pxToCm(ATTEMPTS_X + i * (chipW + CHIP_GAP) + chipW / 2 - w / 2), 0, Z_ITEM))
    })
    this.plus.getTransform().setLocalPosition(new vec3(pxToCm(w / 2 - 6 - PLUS_W / 2), 0, Z_ITEM))
  }

  /** A pressable take in the ATTEMPTS row. */
  private chip(index: number): Chip {
    const object = childObject(`Take${index}`, this.attempts)
    const rect = makeRect(object, "panel", 2)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("soft")
    const label = this.label(object, TYPE.chip, "ink2")
    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    this.setHitBox(object, 1, 1)
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(() => {
      if (index < this.shown) this.onSelect(index)
    })
    return { object, rect, label }
  }

  private setHitBox(object: SceneObject, wPx: number, hPx: number) {
    const collider = object.getComponent("ColliderComponent") as ColliderComponent
    if (!collider) return
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
    collider.shape = shape
  }

  /** A bordered panel, sized on first render. */
  private panel(parent: SceneObject): RoundedRectangle {
    const rect = makeRect(parent, "panel", 1)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("stroke")
    return rect
  }

  /** An outlined button: pressable with onPress, else greyed out. */
  private outlined(name: string, parent: SceneObject, w: number, h: number, radius: number, onPress?: () => void): SceneObject {
    const so = childObject(name, parent)
    const rect = makeRect(so, "panel", 2)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor(onPress ? "ink" : "ghostLine")
    setRectSize(rect, w, h, radius)
    if (onPress) {
      const collider = so.createComponent("ColliderComponent") as ColliderComponent
      collider.fitVisual = false
      this.setHitBox(so, w, h)
      const interactable = so.createComponent(Interactable.getTypeName()) as Interactable
      interactable.onTriggerEnd.add(onPress)
    }
    return so
  }

  private label(parent: SceneObject, sizePx: number, token: ColorToken, align: "left" | "center" | "right" = "center"): Label {
    const object = childObject("Label", parent)
    object.getTransform().setLocalPosition(new vec3(0, 0, Z_ITEM / 2))
    return { object, text: makeText(object, sizePx, token, 4, align) }
  }
}
