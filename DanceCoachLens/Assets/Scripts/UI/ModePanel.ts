/**
 * ModePanel: the B2 mode panel (BUILD_SPEC §6.8), replacing the old control bar and its cycling mode button.
 *
 * One glass container, right-aligned to the video, 24 under the element above it. Row 1 is the mode track:
 * Playthrough · Pose · Lookback, the selected one volt (pink for Lookback). Pinching a segment calls onSelect.
 * Row 2 is that mode's controls (ModeRow.modeRow): Replay section, From the top, Speed (one button that cycles),
 * Mirror and Counts (white when on, option A), Finish routine on C2, and Record again / Back to takes on side by side.
 * A pinch on one calls onPress. On Pose's open screen (E) the scrub sits between the rows (a 12-tall bar,
 * a 24x28 volt pill playhead and the 16-column "1 & 2 & ... 8 &" labels), and row 2 is back, Step size, forward, Mirror, Counts;
 * pinching and dragging the scrub calls onScrub / onScrubEnd, and a step-size option calls onStepSize.
 * `aimed` says whether the hand ray is on the panel, which keeps Pose open.
 * A shallow view: render() shows the view state, placed by the screen's controls panel in Layout.SCREENS.
 * It's hidden on screens without one, so it can't be pressed mid-run.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { STILLS_PER_SECTION } from "../Core/DancePackage"
import { LookbackView } from "../Core/LookbackController"
import { Mode, MODES, ViewState } from "../Core/PlaybackController"
import { PoseView } from "../Core/PoseController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { CONTROL_WIDTH, hasScrub, MODE_PANEL, ModeControl, modePanelSize, modeRow, POSE_SCRUB, rowWidth, speedLabel, STEP_OPTION_WIDTH } from "./ModeRow"
import { ColorToken, RADIUS, SIZE, SPACE } from "./Theme"
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

interface StepOption {
  half: boolean
  object: SceneObject
  rect: RoundedRectangle
  regular: Text
  strong: Text
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
  /** Called when a step-size option is pinched: true for half a count. */
  onStepSize: (half: boolean) => void = () => {}
  /** Called while the scrub is pinched, with how far along it the hand is (0 to 1). */
  onScrub: (fraction: number) => void = () => {}
  /** Called when the scrub is let go. */
  onScrubEnd: () => void = () => {}

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
  private hovered = 0
  private panelWidth = 0
  private scrubBarY = 0
  private scrubObject: SceneObject
  private scrubTrack: RoundedRectangle
  private scrubTrackObject: SceneObject
  private scrubFill: RoundedRectangle
  private scrubFillObject: SceneObject
  private handleObject: SceneObject
  private scrubWidthPx = 1
  private scrubWidthCm = 1
  private marks: { object: SceneObject; text: Text }[] = []
  private stepOptions: StepOption[] = []
  private layoutKey = ""
  private lastKey = ""

  /** True while the hand ray is on the panel's controls. */
  get aimed(): boolean {
    return this.hovered > 0
  }

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
    this.awakePose()
    this.sceneObject.enabled = false
  }

  render(view: ViewState, look: LookbackView | null = null, pose: PoseView | null = null) {
    const box = panelsFor(view).controls
    this.sceneObject.enabled = !!box
    if (!box) {
      this.layoutKey = ""
      // A hidden panel sends no hover-exit.
      this.hovered = 0
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
    const key = `${view.mode}|${speed}|${st.mirror}|${st.counts}|${pose ? `${pose.step}|${pose.halfCounts}` : ""}`
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
    if (pose && hasScrub(row)) this.renderPose(box, pose)
  }

  /** The scrub's fill and playhead at the step on show, the current label volt, and the selected step size white. */
  private renderPose(box: PxRect, pose: PoseView) {
    const frac = (pose.step + 0.5) / STILLS_PER_SECTION
    const sw = this.scrubWidthPx
    const x0 = box[2] - this.panelWidth + MODE_PANEL.pad + POSE_SCRUB.inset
    const y = this.scrubBarY
    // The white fill runs to the playhead's centre.
    place(this.scrubFillObject, pointInPanelCm(box, x0 + (sw * frac) / 2, y), Z_CONTROL + Z_LABEL)
    setRectSize(this.scrubFill, sw * frac, POSE_SCRUB.barHeight, RADIUS.pill)
    place(this.handleObject, pointInPanelCm(box, x0 + sw * frac, y), Z_CONTROL + 2 * Z_LABEL)
    this.marks.forEach(({ text }, i) => (text.textFill.color = themeColor(i === pose.step ? "volt" : "textMuted")))
    for (const o of this.stepOptions) {
      const on = o.half === pose.halfCounts
      o.rect.backgroundColor = on ? themeColor("text") : CLEAR
      o.strong.getSceneObject().enabled = on
      o.regular.getSceneObject().enabled = !on
    }
  }

  /** Builds E's extras: the scrub, the step-size track and the two arrows. They show only when row 2 holds them. */
  private awakePose() {
    this.scrubObject = childObject("Scrub", this.sceneObject)
    this.hit(this.scrubObject, () => {}, 100, POSE_SCRUB.height)
    const interactable = this.scrubObject.getComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerStart.add((e) => this.scrubTo(e))
    interactable.onTriggerUpdate.add((e) => this.scrubTo(e))
    interactable.onTriggerEnd.add(() => this.onScrubEnd())
    interactable.onTriggerCanceled.add(() => this.onScrubEnd())
    this.scrubTrackObject = childObject("ScrubTrack", this.sceneObject)
    this.scrubTrack = makePill(this.scrubTrackObject, "control", 3, 100, POSE_SCRUB.barHeight)
    this.scrubFillObject = childObject("ScrubFill", this.sceneObject)
    this.scrubFill = makePill(this.scrubFillObject, "text", 4, 100, POSE_SCRUB.barHeight)
    this.handleObject = childObject("Playhead", this.sceneObject)
    makePill(this.handleObject, "volt", 5, POSE_SCRUB.handle.w, POSE_SCRUB.handle.h)
    for (let i = 0; i < STILLS_PER_SECTION; i++) {
      const object = childObject(`Mark${i}`, this.sceneObject)
      const text = makeText(object, "label", "textMuted", 4)
      text.text = i % 2 ? "&" : String(i / 2 + 1)
      this.marks.push({ object, text })
    }

    this.poseIcon("back")
    this.poseIcon("forward")
    const stepTrack = childObject("step", this.sceneObject)
    makePill(stepTrack, "track", 3, CONTROL_WIDTH.step, SIZE.control)
    this.controls.step = stepTrack
    for (const half of [false, true]) {
      const object = childObject(half ? "Half count" : "One count", stepTrack)
      const rect = makePill(object, "text", 4, STEP_OPTION_WIDTH, SIZE.segment)
      const label = childObject("Label", object)
      label.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
      const regular = makeText(label, "button", "textMuted", 5)
      const strong = makeText(label, "buttonStrong", "onColor", 5)
      regular.text = strong.text = half ? "\u00BD count" : "1 count"
      const x = (half ? 1 : -1) * ((STEP_OPTION_WIDTH + SPACE.control) / 2)
      object.getTransform().setLocalPosition(new vec3(pxToCm(x), 0, Z_LABEL))
      this.hit(object, () => this.onStepSize(half), STEP_OPTION_WIDTH, SIZE.segment)
      this.stepOptions.push({ half, object, rect, regular, strong })
    }
  }

  /** The back or forward arrow: a 56 circle in the control fill that steps by the selected size. */
  private poseIcon(id: "back" | "forward") {
    const object = childObject(id, this.sceneObject)
    makeIconButton(object, id, 3)
    this.hit(object, () => this.onPress(id), SIZE.control)
    this.controls[id] = object
  }

  /** Where along the scrub the pinch is, from the ray's point on the panel's plane. */
  private scrubTo(e: InteractorEvent) {
    const p = e.interactor.planecastPoint
    if (!p) return
    const local = this.scrubObject.getTransform().getInvertedWorldTransform().multiplyPoint(p)
    this.onScrub(local.x / this.scrubWidthCm + 0.5)
  }

  /**
   * Sizes the panel to its rows and right-aligns it in the box: the track across the top in three equal segments,
   * row 2 centred under it. Only row 2's controls for this screen show.
   */
  private layout(box: PxRect, row: ModeControl[]) {
    const p = MODE_PANEL
    const { w, h } = modePanelSize(row)
    const left = box[2] - w
    this.panelWidth = w
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
    const scrubOn = hasScrub(row)
    const scrubTop = p.pad + p.trackHeight + p.rowGap
    this.layoutScrub(box, left, w, scrubTop, scrubOn)
    const rowY = scrubTop + (scrubOn ? POSE_SCRUB.height + p.rowGap : 0) + p.rowHeight / 2
    let x = left + (w - rowWidth(row)) / 2
    for (const id of row) {
      const cw = CONTROL_WIDTH[id]
      place(this.controls[id], pointInPanelCm(box, x + cw / 2, rowY), Z_CONTROL)
      x += cw + p.gap
    }
  }

  /** Places the scrub row: the bar and its pinch area, the playhead's box and the 16 labels' columns. */
  private layoutScrub(box: PxRect, left: number, w: number, top: number, on: boolean) {
    for (const o of [this.scrubObject, this.scrubTrackObject, this.scrubFillObject, this.handleObject]) o.enabled = on
    for (const m of this.marks) m.object.enabled = on
    if (!on) return
    const sw = w - 2 * (MODE_PANEL.pad + POSE_SCRUB.inset)
    const x0 = left + MODE_PANEL.pad + POSE_SCRUB.inset
    this.scrubWidthPx = sw
    this.scrubWidthCm = pxToCm(sw)
    this.scrubBarY = top + POSE_SCRUB.handleY + POSE_SCRUB.handle.h / 2
    place(this.scrubObject, pointInPanelCm(box, x0 + sw / 2, this.scrubBarY), Z_CONTROL + 3 * Z_LABEL)
    this.setHitSize(this.scrubObject.getComponent("ColliderComponent") as ColliderComponent, sw, POSE_SCRUB.height)
    place(this.scrubTrackObject, pointInPanelCm(box, x0 + sw / 2, this.scrubBarY), Z_CONTROL)
    setRectSize(this.scrubTrack, sw, POSE_SCRUB.barHeight, RADIUS.pill)
    this.marks.forEach(({ object }, i) => place(object, pointInPanelCm(box, x0 + (i + 0.5) * (sw / STILLS_PER_SECTION), top + POSE_SCRUB.labelY), Z_CONTROL))
    // Forces the fill and playhead to be placed again on the next render.
    this.lastKey = ""
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

  private hit(object: SceneObject, onPinch: () => void, wPx = 100, hPx: number = SIZE.control): ColliderComponent {
    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    this.setHitSize(collider, wPx, hPx)
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onHoverEnter.add(() => this.hovered++)
    interactable.onHoverExit.add(() => (this.hovered = Math.max(0, this.hovered - 1)))
    interactable.onTriggerEnd.add(onPinch)
    return collider
  }

  private setHitSize(collider: ColliderComponent, wPx: number, hPx: number) {
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
    collider.shape = shape
  }
}
