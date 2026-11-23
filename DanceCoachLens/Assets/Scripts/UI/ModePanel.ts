/**
 * ModePanel: the B2 mode panel (BUILD_SPEC §6.8), replacing the old control bar and its cycling mode button.
 *
 * One glass container, right-aligned to the video, 24 under the element above it. Row 1 is the mode track:
 * Playthrough · Pose · Lookback, the selected one volt (pink for Lookback). Pinching a segment calls onSelect.
 * Row 2 is that mode's controls (ModeRow.modeRow): Replay section, From the top, Speed (one button that cycles),
 * Mirror and Counts (white when on, option A), Finish routine on C2, and Record again / Back to takes on side by side.
 * A pinch on one calls onPress.
 * A shallow view: render() shows the view state, placed by the screen's controls panel in Layout.SCREENS.
 * It's hidden on screens without one, so it can't be pressed mid-run.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { LookbackView } from "../Core/LookbackController"
import { Mode, MODES, ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { CONTROL_WIDTH, MODE_PANEL, ModeControl, modePanelSize, modeRow, rowWidth, speedLabel } from "./ModeRow"
import { ColorToken, RADIUS, SIZE } from "./Theme"
import { childObject, IconButton, makeIcon, makeIconButton, makePill, makeSurface, makeText, place, setRectSize, setSurfaceBorder, themeColor } from "./Visuals"

// Layers in front of the window plane, in cm: the panel, the track, the segments and buttons, then their labels.
const Z_PANEL = 0.1
const Z_TRACK = 0.15
const Z_CONTROL = 0.2
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
// Replay section's icon: 20 wide, 20 in from the button's left, then 8 to its label (layout.json B2PlayEnd).
const REPLAY_ICON = { inset: 20, size: 20, gap: 8 }
const CLEAR = new vec4(0, 0, 0, 0)

interface Segment {
  mode: Mode
  object: SceneObject
  rect: RoundedRectangle
  /** The label in Button (600) when unselected and Button strong (700) when selected: two texts, one shown. */
  regular: Text
  strong: Text
  collider: ColliderComponent
}

interface TextButton {
  object: SceneObject
  rect: RoundedRectangle
  text: Text
}

@component
export class ModePanel extends BaseScriptComponent {
  /** Called when a mode segment is pinched. */
  onSelect: (mode: Mode) => void = () => {}
  /** Called when a row 2 control is pinched. */
  onPress: (command: ModeControl) => void = () => {}

  private panelObject: SceneObject
  private panel: RoundedRectangle
  private trackObject: SceneObject
  private track: RoundedRectangle
  private segments: Segment[] = []
  private controls = {} as Record<ModeControl, SceneObject>
  private replay: TextButton
  private speed: TextButton
  private finish: TextButton
  private again: TextButton
  private mirror: IconButton
  private counts: IconButton
  private layoutKey = ""
  private lastKey = ""

  onAwake() {
    this.panelObject = childObject("Panel", this.sceneObject)
    this.panel = makeSurface(this.panelObject, { fill: "panel", border: "border", borderPx: 1, radius: RADIUS.xl }, 1, 400, 144)
    this.trackObject = childObject("Track", this.sceneObject)
    this.track = makePill(this.trackObject, "track", 2, 400, MODE_PANEL.trackHeight)

    for (const mode of MODES) {
      const object = childObject(`Mode ${mode}`, this.sceneObject)
      const rect = makePill(object, "volt", 3, 100, SIZE.segment)
      const label = childObject("Label", object)
      label.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
      const regular = makeText(label, "button", "textMuted", 4)
      const strong = makeText(label, "buttonStrong", "onColor", 4)
      regular.text = strong.text = mode
      const collider = this.hit(object, () => this.onSelect(mode))
      this.segments.push({ mode, object, rect, regular, strong, collider })
    }

    this.replay = this.textButton("replay", "Replay section")
    // The label sits right of the icon, so the pair is centred as one.
    const labelShift = (REPLAY_ICON.size + REPLAY_ICON.gap) / 2
    this.replay.text.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(pxToCm(labelShift), 0, Z_LABEL))
    const icon = makeIcon(this.controls.replay, "replay", "text", 3, REPLAY_ICON.size).object
    icon.getTransform().setLocalPosition(new vec3(pxToCm(REPLAY_ICON.inset + REPLAY_ICON.size / 2 - CONTROL_WIDTH.replay / 2), 0, Z_LABEL))
    this.textButton("top", "From the top")
    this.speed = this.textButton("speed", "1×")
    this.mirror = this.iconButton("mirror")
    this.counts = this.iconButton("counts")
    this.finish = this.textButton("finish", "Finish routine", "buttonStrong", "onColor")
    this.finish.rect.backgroundColor = themeColor("volt")
    this.again = this.textButton("recordAgain", "Record again")
    this.again.rect.backgroundColor = CLEAR
    setSurfaceBorder(this.again.rect, "pink", 2)
    this.again.text.textFill.color = themeColor("pink")
    this.textButton("backToTakes", "Back to takes")
    this.sceneObject.enabled = false
  }

  render(view: ViewState, look: LookbackView | null = null) {
    const box = panelsFor(view).controls
    this.sceneObject.enabled = !!box
    if (!box) {
      this.layoutKey = ""
      return
    }
    const row = modeRow(view.screen)
    const layoutKey = `${view.screen}|${box.join(",")}`
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey
      this.lastKey = ""
      this.layout(box, row)
    }

    const st = view.settings
    const speed = view.screen === "M" && look && look.sideBySide ? look.sideBySide.speed : st.speed
    const key = `${view.mode}|${speed}|${st.mirror}|${st.counts}`
    if (key === this.lastKey) return
    this.lastKey = key

    for (const seg of this.segments) {
      const on = seg.mode === view.mode
      seg.rect.backgroundColor = on ? themeColor(seg.mode === "Lookback" ? "pink" : "volt") : CLEAR
      seg.strong.getSceneObject().enabled = on
      seg.regular.getSceneObject().enabled = !on
    }
    this.speed.text.text = speedLabel(speed)
    this.mirror.setOn(st.mirror)
    this.counts.setOn(st.counts)
  }

  /**
   * Sizes the panel to its rows and right-aligns it in the box: the track across the top in three equal segments,
   * row 2 centred under it. Only row 2's controls for this screen show.
   */
  private layout(box: PxRect, row: ModeControl[]) {
    const p = MODE_PANEL
    const { w, h } = modePanelSize(row)
    const left = box[2] - w
    place(this.panelObject, pointInPanelCm(box, left + w / 2, h / 2), Z_PANEL)
    setRectSize(this.panel, w, h, RADIUS.xl)

    const trackW = w - 2 * p.pad
    const trackY = p.pad + p.trackHeight / 2
    place(this.trackObject, pointInPanelCm(box, left + w / 2, trackY), Z_TRACK)
    setRectSize(this.track, trackW, p.trackHeight, RADIUS.pill)
    const segW = (trackW - 2 * p.trackPad - (MODES.length - 1) * p.segmentGap) / MODES.length
    this.segments.forEach((seg, i) => {
      const x = left + p.pad + p.trackPad + i * (segW + p.segmentGap) + segW / 2
      place(seg.object, pointInPanelCm(box, x, trackY), Z_CONTROL)
      setRectSize(seg.rect, segW, SIZE.segment, RADIUS.pill)
      this.setHitSize(seg.collider, segW, SIZE.segment)
    })

    for (const id of Object.keys(this.controls) as ModeControl[]) this.controls[id].enabled = row.indexOf(id) >= 0
    const rowY = p.pad + p.trackHeight + p.rowGap + p.rowHeight / 2
    let x = left + (w - rowWidth(row)) / 2
    for (const id of row) {
      const cw = CONTROL_WIDTH[id]
      place(this.controls[id], pointInPanelCm(box, x + cw / 2, rowY), Z_CONTROL)
      x += cw + p.gap
    }
  }

  /** A 56-tall pill button with a centred label; secondary (control fill, white text) until restyled. */
  private textButton(id: ModeControl, label: string, style: "button" | "buttonStrong" = "button", token: ColorToken = "text"): TextButton {
    const object = childObject(id, this.sceneObject)
    const rect = makePill(object, "control", 3, CONTROL_WIDTH[id], SIZE.control)
    const labelObject = childObject("Label", object)
    labelObject.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
    const text = makeText(labelObject, style, token, 4)
    text.text = label
    this.hit(object, () => this.onPress(id), CONTROL_WIDTH[id])
    this.controls[id] = object
    return { object, rect, text }
  }

  /** Mirror or Counts: a 56 circle, white with a dark icon when on. */
  private iconButton(id: "mirror" | "counts"): IconButton {
    const object = childObject(id, this.sceneObject)
    const button = makeIconButton(object, id, 3)
    this.hit(object, () => this.onPress(id), SIZE.control)
    this.controls[id] = object
    return button
  }

  private hit(object: SceneObject, onPinch: () => void, wPx = 100): ColliderComponent {
    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    this.setHitSize(collider, wPx, SIZE.control)
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(onPinch)
    return collider
  }

  private setHitSize(collider: ColliderComponent, wPx: number, hPx: number) {
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
    collider.shape = shape
  }
}
