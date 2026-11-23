/**
 * SegBar: the section bar 16 under the video during the first look (A1), From the top (F) and Full (BUILD_SPEC §6.6).
 *
 * One 8-tall segment per section, 4 apart: done white, the current one volt to its progress over the control track,
 * upcoming control, and sections beyond the run's stop a 1 px dashed tick-off outline. Each segment's number sits 4
 * under it in Inter 12: the current one volt (with "▸" on A1), beyond the stop disabled, the rest muted.
 * A shallow view: render() shows the view state, placed by the screen's segBar panel
 * in Layout.panelsFor (Full plays on B, so its panels depend on the run too).
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, PxRect } from "./Layout"
import { ColorToken, RADIUS, SIZE, SPACE, TEXT } from "./Theme"
import { childObject, Icon, makeDashedOutline, makeIcon, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

const Z = 0.1
// The fill sits just in front of its segment.
const Z_FILL = 0.12
// The labels: Inter 12/16, 600, or 700 for the current section; their line's centre is 4 under the bar.
const LABEL = TEXT.label
const LABEL_CURRENT = { ...TEXT.label, weight: 700 as const }
const LABEL_Y = SIZE.bar + SPACE.control + LABEL.lineHeight / 2
// "▸" after the current number on A1, drawn (Inter has no ▸): 8 px box, after "n " (about 10 px in Inter 12/700).
const ARROW_SIZE = 8
const ARROW_X = 13

/** How a segment looks: played, playing, still to come in the run, or beyond where the run stops. */
type SegState = "done" | "current" | "upcoming" | "beyond"
const SEG_FILL: Record<SegState, ColorToken | null> = { done: "text", current: "control", upcoming: "control", beyond: null }
const LABEL_COLOR: Record<SegState, ColorToken> = { done: "textMuted", current: "volt", upcoming: "textMuted", beyond: "textDisabled" }

interface Segment {
  object: SceneObject
  rect: RoundedRectangle
  dashed: SceneObject | null
  fillObject: SceneObject
  fill: RoundedRectangle
  labelObject: SceneObject
  label: Text
  boldObject: SceneObject
  bold: Text
}

@component
export class SegBar extends BaseScriptComponent {
  private segments: Segment[] = []
  private arrow: Icon
  private box: PxRect | null = null
  private lastKey = ""
  private lastFillPx = -1

  onAwake() {
    this.arrow = makeIcon(childObject("Arrow", this.sceneObject), "play", "volt", 2, ARROW_SIZE)
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const box = panelsFor(view).segBar
    this.sceneObject.enabled = !!box
    if (!box) {
      this.box = null
      return
    }
    if (this.segments.length !== view.sectionCount) this.build(view.sectionCount)
    const sw = this.segmentWidth(box)
    const key = `${view.screen}|${view.runKind}|${view.section}|${view.runSection}|${view.runStop}`
    if (box !== this.box || key !== this.lastKey) {
      this.box = box
      this.lastKey = key
      this.lastFillPx = -1
      this.layout(view, box, sw)
    }

    // The segment playing fills to whole pixels, so its rectangle isn't rebuilt every frame.
    const cur = this.segments[view.runSection - 1]
    const fillPx = Math.round(sw * view.sectionProgress)
    if (!cur || fillPx === this.lastFillPx) return
    this.lastFillPx = fillPx
    cur.fillObject.enabled = fillPx > 0
    if (fillPx > 0) {
      const fw = Math.max(SIZE.bar, fillPx)
      const x = (view.runSection - 1) * (sw + SPACE.control)
      place(cur.fillObject, pointInPanelCm(box, x + fw / 2, SIZE.bar / 2), Z_FILL)
      setRectSize(cur.fill, fw, SIZE.bar, RADIUS.sm)
    }
  }

  private segmentWidth(box: PxRect): number {
    const n = this.segments.length
    return (box[2] - SPACE.control * (n - 1)) / n
  }

  /** A section's state in the run on screen. */
  private stateOf(view: ViewState, n: number): SegState {
    // Out of the run: after its last section, or (for a range) before its first.
    if (n > view.runStop || (view.runKind === "section" && n < view.section)) return "beyond"
    if (n === view.runSection) return "current"
    return n < view.runSection ? "done" : "upcoming"
  }

  private layout(view: ViewState, box: PxRect, sw: number) {
    const h = SIZE.bar
    const firstLook = view.screen === "PV"
    this.arrow.object.enabled = false
    this.segments.forEach((seg, i) => {
      const n = i + 1
      const x = i * (sw + SPACE.control)
      const state = this.stateOf(view, n)
      place(seg.object, pointInPanelCm(box, x + sw / 2, h / 2), Z)
      const fill = SEG_FILL[state]
      seg.rect.getSceneObject().enabled = !!fill
      if (fill) {
        setRectSize(seg.rect, sw, h, RADIUS.sm)
        seg.rect.backgroundColor = themeColor(fill)
      }
      if (state === "beyond" && !seg.dashed) seg.dashed = makeDashedOutline(childObject("Dashed", seg.object), "tickOff", 1, sw, h)
      if (seg.dashed) seg.dashed.enabled = state === "beyond"
      seg.fillObject.enabled = false

      // The current number is bold; the rest share one weight, so the two labels swap.
      const current = state === "current"
      seg.labelObject.enabled = !current
      seg.boldObject.enabled = current
      seg.label.text = seg.bold.text = String(n)
      seg.label.textFill.color = themeColor(LABEL_COLOR[state])
      place(seg.labelObject, pointInPanelCm(box, x, LABEL_Y), Z)
      place(seg.boldObject, pointInPanelCm(box, x, LABEL_Y), Z)
      if (current && firstLook) {
        this.arrow.object.enabled = true
        place(this.arrow.object, pointInPanelCm(box, x + ARROW_X, LABEL_Y), Z)
      }
    })
  }

  private build(sectionCount: number) {
    this.segments.forEach((s) => [s.object, s.fillObject, s.labelObject, s.boldObject].forEach((o) => o.destroy()))
    this.segments = []
    for (let n = 1; n <= sectionCount; n++) {
      const object = childObject(`Segment ${n}`, this.sceneObject)
      const rect = makeRect(childObject("Bar", object), "control", 1)
      const fillObject = childObject(`Fill ${n}`, this.sceneObject)
      const fill = makeRect(fillObject, "volt", 2)
      const labelObject = childObject(`Label ${n}`, this.sceneObject)
      const label = makeText(labelObject, LABEL, "textMuted", 2, "left")
      const boldObject = childObject(`Current ${n}`, this.sceneObject)
      const bold = makeText(boldObject, LABEL_CURRENT, "volt", 2, "left")
      this.segments.push({ object, rect, dashed: null, fillObject, fill, labelObject, label, boldObject, bold })
    }
    this.box = null
  }
}
