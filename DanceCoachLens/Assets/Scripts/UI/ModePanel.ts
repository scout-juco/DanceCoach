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
 *
 * The track is a fixed 384 wide, pinned to the panel's top-right (§6.8), and the selection is one pill that slides
 * between its segments. Changing mode plays the switch motion (§6.8a, ModeSwitch): the panel's top-right corner stays
 * put while its real size tweens, the old row fades out, and the new one fades in right to left. Pinches on the
 * track are ignored until it's over.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { STILLS_PER_SECTION } from "../Core/DancePackage"
import { LookbackView } from "../Core/LookbackController"
import { Mode, MODES, ViewState } from "../Core/PlaybackController"
import { PoseView } from "../Core/PoseController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import {
  CONTROL_WIDTH,
  hasScrub,
  MODE_PANEL,
  MODE_TRACK_WIDTH,
  ModeControl,
  modePanelSize,
  modeRow,
  POSE_SCRUB,
  rowWidth,
  SEGMENT_WIDTH,
  segmentFromRight,
  speedLabel,
  STEP_OPTION_WIDTH,
} from "./ModeRow"
import { Box, controlInWindow, MODE_SWITCH, panelAt, progress, switchLength } from "./ModeSwitch"
import { ColorToken, RADIUS, SIZE, SPACE } from "./Theme"
import {
  childObject,
  addHover,
  GroupFade,
  IconButton,
  makeIcon,
  makeIconButton,
  makePill,
  makeSurface,
  makeText,
  mixColor,
  place,
  setRectSize,
  setSurfaceBorder,
  themeColor,
} from "./Visuals"

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
// Positions are absolute prototype px, since the panel's own rectangle moves while it switches.
const ORIGIN: PxRect = [0, 0, 0, 0]
const pt = (x: number, y: number) => pointInPanelCm(ORIGIN, x, y)
const pillColor = (mode: Mode) => themeColor(mode === "Lookback" ? "pink" : "volt")

interface Segment {
  mode: Mode
  object: SceneObject
  /** The label in Button (600) when unselected and Button strong (700) when selected: two texts, one shown. */
  regular: Text
  strong: Text
}

/** The step-size thumb's slide, in seconds, and where it rests either side of the track's centre (px). */
const STEP_SLIDE_SEC = 0.16
const STEP_THUMB_X = (STEP_OPTION_WIDTH + SPACE.control) / 2

interface StepOption {
  half: boolean
  object: SceneObject
  regular: Text
  strong: Text
}

interface TextButton {
  object: SceneObject
  rect: RoundedRectangle
  text: Text
}

/** A mode switch under way (§6.8a). */
interface Switch {
  /** getTime() at the tap. */
  start: number
  from: Box
  to: Box
  fromMode: Mode
  toMode: Mode
  row: ModeControl[]
  layoutKey: string
  length: number
  /** The old row 2 (and scrub row) fading out, until the new row replaces it at 100 ms; then null. */
  out: GroupFade | null
  outGroups: SceneObject[]
  /** The new row's groups, rightmost first, each with its own fade. */
  in: { object: SceneObject; fade: GroupFade }[]
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
  private pillObject: SceneObject
  private pill: RoundedRectangle
  private segments: Segment[] = []
  private controls = {} as Record<ModeControl, SceneObject>
  private replay: TextButton
  private speed: TextButton
  private finish: TextButton
  private again: TextButton
  private mirror: IconButton
  private counts: IconButton
  private hovered = 0
  private scrubX0 = 0
  private scrubBarY = 0
  private scrubRow: SceneObject
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
  private stepThumb: SceneObject
  // The thumb's slide: where it started from and is heading (px from the track's centre), when it set off, and null before the first render.
  private thumbFrom = 0
  private thumbTo = 0
  private thumbStart = 0
  private thumbShown: boolean | null = null
  private layoutKey = ""
  private lastKey = ""
  // What the panel shows: its mode (null while hidden), its rectangle, and where row 2's groups rest.
  private shownMode: Mode | null = null
  private shownRect: Box = [0, 0, 0, 0]
  private homes = new Map<SceneObject, vec3>()
  private switching: Switch | null = null

  /** True while the hand ray is on the panel's controls. */
  get aimed(): boolean {
    return this.hovered > 0
  }

  onAwake() {
    this.panelObject = childObject("Panel", this.sceneObject)
    this.panel = makeSurface(this.panelObject, { fill: "panel", border: "border", borderPx: 1, radius: RADIUS.xl }, 1, 400, 144)
    this.trackObject = childObject("Track", this.sceneObject)
    makePill(this.trackObject, "track", 2, MODE_TRACK_WIDTH, MODE_PANEL.trackHeight)
    this.pillObject = childObject("Selection", this.sceneObject)
    this.pill = makePill(this.pillObject, "volt", 3, SEGMENT_WIDTH, SIZE.segment)

    for (const mode of MODES) {
      const object = childObject(`Mode ${mode}`, this.sceneObject)
      const label = childObject("Label", object)
      label.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
      const regular = makeText(label, "button", "textMuted", 4)
      const strong = makeText(label, "buttonStrong", "onColor", 4)
      regular.text = strong.text = mode
      // Ignored while a switch runs (§6.8a).
      this.hit(object, () => !this.switching && this.onSelect(mode), SEGMENT_WIDTH, SIZE.segment, { wPx: SEGMENT_WIDTH, hPx: SIZE.segment, radiusPx: RADIUS.pill, order: 3 })
      this.segments.push({ mode, object, regular, strong })
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
    this.createEvent("UpdateEvent").bind(() => this.animate())
    this.createEvent("UpdateEvent").bind(() => this.animateStep())
  }

  render(view: ViewState, look: LookbackView | null = null, pose: PoseView | null = null) {
    const box = panelsFor(view).controls
    this.sceneObject.enabled = !!box
    if (!box) {
      this.endSwitch()
      this.layoutKey = ""
      this.shownMode = null
      // A hidden panel sends no hover-exit.
      this.hovered = 0
      return
    }
    const row = modeRow(view.screen)
    const { w, h } = modePanelSize(row)
    const rect: Box = [box[0] + box[2] - w, box[1], w, h]
    // Keyed by what the panel holds, not the screen: Lookback's I and L are the same panel.
    const layoutKey = `${row.join(",")}|${rect.join(",")}`
    // Something else changed the panel mid-switch: finish the switch at once, then lay out what's asked.
    if (this.switching && layoutKey !== this.switching.layoutKey) this.endSwitch()
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey
      this.lastKey = ""
      if (this.shownMode && this.shownMode !== view.mode) this.startSwitch(view.mode, rect, row, layoutKey)
      else {
        this.shownMode = view.mode
        this.layoutFrame(rect)
        this.layoutRows(rect, row)
      }
    }
    this.shownMode = view.mode

    const st = view.settings
    const speed = view.screen === "M" && look && look.sideBySide ? look.sideBySide.speed : st.speed
    const key = `${view.mode}|${speed}|${st.mirror}|${st.counts}|${pose ? `${pose.step}|${pose.halfCounts}` : ""}`
    if (key === this.lastKey) return
    this.lastKey = key

    if (!this.switching) this.placePill(view.mode, view.mode, 1)
    this.speed.text.text = speedLabel(speed)
    this.mirror.setOn(st.mirror)
    this.counts.setOn(st.counts)
    if (pose && hasScrub(row)) this.renderPose(pose)
  }

  /**
   * The selection pill k of the way from one mode's segment to another's, its fill mixing volt and pink;
   * the labels swap weight halfway.
   */
  private placePill(from: Mode, to: Mode, k: number) {
    const [left, top, w] = this.shownRect
    const y = top + MODE_PANEL.pad + MODE_PANEL.trackHeight / 2
    const x0 = left + w - segmentFromRight(MODES.indexOf(from))
    const x1 = left + w - segmentFromRight(MODES.indexOf(to))
    place(this.pillObject, pt(x0 + (x1 - x0) * k, y), Z_CONTROL - Z_LABEL / 2)
    this.pill.backgroundColor = mixColor(pillColor(from), pillColor(to), k)
    const selected = k < 0.5 ? from : to
    for (const seg of this.segments) {
      const on = seg.mode === selected
      seg.strong.getSceneObject().enabled = on
      seg.regular.getSceneObject().enabled = !on
    }
  }

  /** Starts the switch motion (§6.8a) from the panel on show to the new mode's. */
  private startSwitch(mode: Mode, to: Box, row: ModeControl[], layoutKey: string) {
    const outGroups = this.visibleGroups()
    this.switching = {
      start: getTime(),
      from: this.shownRect,
      to,
      fromMode: this.shownMode!,
      toMode: mode,
      row,
      layoutKey,
      // Into Lookback, the track stays locked until the takes panel is in (750 ms).
      length: switchLength(row.length + (hasScrub(row) ? 1 : 0), mode === "Lookback"),
      out: new GroupFade(outGroups),
      outGroups,
      in: [],
    }
    this.animate()
  }

  /** Row 2's controls and the scrub row, whichever are showing. */
  private visibleGroups(): SceneObject[] {
    const groups = (Object.keys(this.controls) as ModeControl[]).map((id) => this.controls[id]).filter((o) => o.enabled)
    if (this.scrubRow.enabled) groups.push(this.scrubRow)
    return groups
  }

  /** One frame of the switch: the pill, the old row out, the panel's size, the new row in. */
  private animate() {
    const sw = this.switching
    if (!sw) return
    const ms = (getTime() - sw.start) * 1000
    if (sw.out) {
      sw.out.apply(1 - progress(ms, MODE_SWITCH.out))
      if (ms >= MODE_SWITCH.out.end) {
        // The old row is gone: lay the new one out where it ends up, unseen, then fade it in.
        sw.out.finish()
        sw.out = null
        for (const o of sw.outGroups) o.enabled = false
        this.layoutRows(sw.to, sw.row)
        const groups = this.visibleGroups()
        // Right to left: row 2 from its right end, then the scrub row above it.
        const ordered = groups.filter((o) => o !== this.scrubRow).sort((a, b) => this.homes.get(b)!.x - this.homes.get(a)!.x)
        if (groups.indexOf(this.scrubRow) >= 0) ordered.push(this.scrubRow)
        sw.in = ordered.map((object) => ({ object, fade: new GroupFade([object]) }))
        // The fill and playhead are placed on the next render.
        this.lastKey = ""
      }
    }
    this.layoutFrame(panelAt(ms, sw.from, sw.to))
    this.placePill(sw.fromMode, sw.toMode, progress(ms, MODE_SWITCH.pill))
    sw.in.forEach(({ object, fade }, i) => {
      const k = progress(ms, controlInWindow(i))
      fade.apply(k)
      const home = this.homes.get(object)!
      object.getTransform().setLocalPosition(new vec3(home.x, home.y - pxToCm(MODE_SWITCH.rise) * (1 - k), home.z))
    })
    if (ms >= sw.length) this.endSwitch()
  }

  /** Ends a switch where it would have ended: everything at its place and full colour. */
  private endSwitch() {
    const sw = this.switching
    if (!sw) return
    this.switching = null
    if (sw.out) {
      sw.out.finish()
      // The new row was never laid out: the next render lays the panel out afresh.
      this.layoutKey = ""
    }
    for (const { object, fade } of sw.in) {
      fade.finish()
      object.getTransform().setLocalPosition(this.homes.get(object)!)
    }
    this.layoutFrame(sw.to)
    this.placePill(sw.toMode, sw.toMode, 1)
    this.lastKey = ""
  }

  /** The scrub's fill and playhead at the step on show, the current label volt, and the selected step size white. */
  private renderPose(pose: PoseView) {
    const frac = (pose.step + 0.5) / STILLS_PER_SECTION
    const sw = this.scrubWidthPx
    const x0 = this.scrubX0
    const y = this.scrubBarY
    // The white fill runs to the playhead's centre.
    place(this.scrubFillObject, pt(x0 + (sw * frac) / 2, y), Z_CONTROL + Z_LABEL)
    setRectSize(this.scrubFill, sw * frac, POSE_SCRUB.barHeight, RADIUS.pill)
    place(this.handleObject, pt(x0 + sw * frac, y), Z_CONTROL + 2 * Z_LABEL)
    this.marks.forEach(({ text }, i) => (text.textFill.color = themeColor(i === pose.step ? "volt" : "textMuted")))
    this.slideStep(pose.halfCounts)
  }

  /** Sets the step-size thumb heading for an option: it slides there, or jumps on the first showing and while the panel switches. */
  private slideStep(half: boolean) {
    const to = half ? STEP_THUMB_X : -STEP_THUMB_X
    if (this.thumbShown === null || this.switching) {
      this.thumbFrom = this.thumbTo = to
    } else if (to !== this.thumbTo) {
      this.thumbFrom = this.currentThumbX()
      this.thumbTo = to
      this.thumbStart = getTime()
    }
    this.thumbShown = half
    this.animateStep()
  }

  private currentThumbX(): number {
    const k = Math.min(1, (getTime() - this.thumbStart) / STEP_SLIDE_SEC)
    // Ease out: quick off the mark, soft landing.
    const e = 1 - Math.pow(1 - k, 3)
    return this.thumbFrom + (this.thumbTo - this.thumbFrom) * e
  }

  /** One frame of the thumb's slide; the selected label turns dark once the thumb is past the middle. */
  private animateStep() {
    if (this.thumbShown === null) return
    const x = this.currentThumbX()
    this.stepThumb.getTransform().setLocalPosition(new vec3(pxToCm(x), 0, Z_LABEL / 2))
    const half = x > 0
    for (const o of this.stepOptions) {
      const on = o.half === half
      o.strong.getSceneObject().enabled = on
      o.regular.getSceneObject().enabled = !on
    }
  }

  /** Builds E's extras: the scrub, the step-size track and the two arrows. They show only when row 2 holds them. */
  private awakePose() {
    // The scrub row's parts share one parent, so a switch can fade and lift them as one.
    this.scrubRow = childObject("ScrubRow", this.sceneObject)
    this.scrubObject = childObject("Scrub", this.scrubRow)
    this.hit(this.scrubObject, () => {}, 100, POSE_SCRUB.height)
    const interactable = this.scrubObject.getComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerStart.add((e) => this.inputOpen() && this.scrubTo(e))
    interactable.onTriggerUpdate.add((e) => this.inputOpen() && this.scrubTo(e))
    interactable.onTriggerEnd.add(() => this.onScrubEnd())
    interactable.onTriggerCanceled.add(() => this.onScrubEnd())
    this.scrubTrackObject = childObject("ScrubTrack", this.scrubRow)
    this.scrubTrack = makePill(this.scrubTrackObject, "control", 3, 100, POSE_SCRUB.barHeight)
    this.scrubFillObject = childObject("ScrubFill", this.scrubRow)
    this.scrubFill = makePill(this.scrubFillObject, "text", 4, 100, POSE_SCRUB.barHeight)
    this.handleObject = childObject("Playhead", this.scrubRow)
    makePill(this.handleObject, "volt", 5, POSE_SCRUB.handle.w, POSE_SCRUB.handle.h)
    for (let i = 0; i < STILLS_PER_SECTION; i++) {
      const object = childObject(`Mark${i}`, this.scrubRow)
      const text = makeText(object, "label", "textMuted", 4)
      text.text = i % 2 ? "&" : String(i / 2 + 1)
      this.marks.push({ object, text })
    }

    this.poseIcon("back")
    this.poseIcon("forward")
    const stepTrack = childObject("step", this.sceneObject)
    makePill(stepTrack, "track", 3, CONTROL_WIDTH.step, SIZE.control)
    this.controls.step = stepTrack
    // One white thumb behind the labels slides between the two options.
    this.stepThumb = childObject("Thumb", stepTrack)
    makePill(this.stepThumb, "text", 4, STEP_OPTION_WIDTH, SIZE.segment)
    for (const half of [false, true]) {
      const object = childObject(half ? "Half count" : "One count", stepTrack)
      const label = childObject("Label", object)
      label.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
      const regular = makeText(label, "button", "textMuted", 5)
      const strong = makeText(label, "buttonStrong", "onColor", 5)
      regular.text = strong.text = half ? "½ count" : "1 count"
      const x = (half ? 1 : -1) * ((STEP_OPTION_WIDTH + SPACE.control) / 2)
      object.getTransform().setLocalPosition(new vec3(pxToCm(x), 0, Z_LABEL))
      this.hit(object, () => this.inputOpen() && this.onStepSize(half), STEP_OPTION_WIDTH, SIZE.segment, { wPx: STEP_OPTION_WIDTH, hPx: SIZE.segment, radiusPx: RADIUS.pill, order: 6 })
      this.stepOptions.push({ half, object, regular, strong })
    }
  }

  /** The back or forward arrow: a 56 circle in the control fill that steps by the selected size. */
  private poseIcon(id: "back" | "forward") {
    const object = childObject(id, this.sceneObject)
    const button = makeIconButton(object, id, 3)
    this.hit(object, () => this.inputOpen() && this.onPress(id), SIZE.control, SIZE.control, button.rect)
    this.controls[id] = object
  }

  /** Where along the scrub the pinch is, from the ray's point on the panel's plane. */
  private scrubTo(e: InteractorEvent) {
    const p = e.interactor.planecastPoint
    if (!p) return
    const local = this.scrubObject.getTransform().getInvertedWorldTransform().multiplyPoint(p)
    this.onScrub(local.x / this.scrubWidthCm + 0.5)
  }

  /** Row 2 answers unless it's the old row fading out of a switch. */
  private inputOpen(): boolean {
    return !this.switching || !this.switching.out
  }

  /**
   * The panel at a rectangle (absolute prototype px), with the fixed-width track pinned to its top-right corner.
   * Resizes the real rectangle, never a scale, so the 32 corners, the border and the text keep their size.
   */
  private layoutFrame(r: Box) {
    const p = MODE_PANEL
    const [left, top, w, h] = r
    this.shownRect = r
    place(this.panelObject, pt(left + w / 2, top + h / 2), Z_PANEL)
    setRectSize(this.panel, w, h, RADIUS.xl)
    const right = left + w
    const trackY = top + p.pad + p.trackHeight / 2
    place(this.trackObject, pt(right - p.pad - MODE_TRACK_WIDTH / 2, trackY), Z_TRACK)
    this.segments.forEach((seg, i) => place(seg.object, pt(right - segmentFromRight(i), trackY), Z_CONTROL))
    if (this.shownMode && !this.switching) this.placePill(this.shownMode, this.shownMode, 1)
  }

  /** Row 2 centred under the track in the panel at r, with Pose's scrub row above it. Only this screen's controls show. */
  private layoutRows(r: Box, row: ModeControl[]) {
    const p = MODE_PANEL
    const [left, top, w] = r
    this.homes.clear()
    for (const id of Object.keys(this.controls) as ModeControl[]) this.controls[id].enabled = row.indexOf(id) >= 0
    const scrubOn = hasScrub(row)
    const scrubTop = top + p.pad + p.trackHeight + p.rowGap
    this.layoutScrub(left, w, scrubTop, scrubOn)
    const rowY = scrubTop + (scrubOn ? POSE_SCRUB.height + p.rowGap : 0) + p.rowHeight / 2
    let x = left + (w - rowWidth(row)) / 2
    for (const id of row) {
      const cw = CONTROL_WIDTH[id]
      place(this.controls[id], pt(x + cw / 2, rowY), Z_CONTROL)
      this.homes.set(this.controls[id], this.controls[id].getTransform().getLocalPosition())
      x += cw + p.gap
    }
  }

  /** Places the scrub row: the bar and its pinch area, the playhead's box and the 16 labels' columns. */
  private layoutScrub(left: number, w: number, top: number, on: boolean) {
    this.scrubRow.enabled = on
    if (!on) return
    this.scrubRow.getTransform().setLocalPosition(vec3.zero())
    this.homes.set(this.scrubRow, vec3.zero())
    const sw = w - 2 * (MODE_PANEL.pad + POSE_SCRUB.inset)
    const x0 = left + MODE_PANEL.pad + POSE_SCRUB.inset
    this.scrubX0 = x0
    this.scrubWidthPx = sw
    this.scrubWidthCm = pxToCm(sw)
    this.scrubBarY = top + POSE_SCRUB.handleY + POSE_SCRUB.handle.h / 2
    place(this.scrubObject, pt(x0 + sw / 2, this.scrubBarY), Z_CONTROL + 3 * Z_LABEL)
    this.setHitSize(this.scrubObject.getComponent("ColliderComponent") as ColliderComponent, sw, POSE_SCRUB.height)
    place(this.scrubTrackObject, pt(x0 + sw / 2, this.scrubBarY), Z_CONTROL)
    setRectSize(this.scrubTrack, sw, POSE_SCRUB.barHeight, RADIUS.pill)
    this.marks.forEach(({ object }, i) => place(object, pt(x0 + (i + 0.5) * (sw / STILLS_PER_SECTION), top + POSE_SCRUB.labelY), Z_CONTROL))
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
    this.hit(object, () => this.inputOpen() && this.onPress(id), CONTROL_WIDTH[id], SIZE.control, rect)
    this.controls[id] = object
    return { object, rect, text }
  }

  /** Mirror or Counts: a 56 circle, white with a dark icon when on. */
  private iconButton(id: "mirror" | "counts"): IconButton {
    const object = childObject(id, this.sceneObject)
    const button = makeIconButton(object, id, 3)
    this.hit(object, () => this.inputOpen() && this.onPress(id), SIZE.control, SIZE.control, button.rect)
    this.controls[id] = object
    return button
  }

  private hit(object: SceneObject, onPinch: () => void, wPx = 100, hPx: number = SIZE.control, hover?: Parameters<typeof addHover>[1]): ColliderComponent {
    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    this.setHitSize(collider, wPx, hPx)
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onHoverEnter.add(() => this.hovered++)
    interactable.onHoverExit.add(() => (this.hovered = Math.max(0, this.hovered - 1)))
    interactable.onTriggerEnd.add(onPinch)
    if (hover) addHover(object, hover)
    return collider
  }

  private setHitSize(collider: ColliderComponent, wPx: number, hPx: number) {
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
    collider.shape = shape
  }
}
