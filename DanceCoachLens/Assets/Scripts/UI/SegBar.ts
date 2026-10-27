/**
 * SegBar: the segmented bar under the video during From the top and Full.
 *
 * One segment per section: sections already played are filled, the one playing fills as
 * it goes, and sections the run won't reach are outlined. The label under each segment
 * marks the one playing (▸) and, for From the top, where the run stops (STOP).
 * A shallow view: render() shows the view state, placed by the screen's segBar panel
 * in Layout.panelsFor (Full plays on B, so its panels depend on the run too).
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

const Z = 0.1
// The fill sits just in front of its segment.
const Z_FILL = 0.12

interface Segment {
  object: SceneObject
  rect: RoundedRectangle
  fillObject: SceneObject
  fill: RoundedRectangle
  labelObject: SceneObject
  label: Text
}

@component
export class SegBar extends BaseScriptComponent {
  private segments: Segment[] = []
  private box: PxRect | null = null
  private lastKey = ""
  private lastFillPx = -1

  onAwake() {
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
    const key = `${view.runKind}|${view.runSection}|${view.runStop}`
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
      const fw = Math.max(SPACING.segHeight, fillPx)
      const x = (view.runSection - 1) * (sw + SPACING.segGap)
      place(cur.fillObject, pointInPanelCm(box, x + fw / 2, SPACING.segHeight / 2), Z_FILL)
      setRectSize(cur.fill, fw, SPACING.segHeight, RADII.segment)
    }
  }

  private segmentWidth(box: PxRect): number {
    const n = this.segments.length
    return (box[2] - SPACING.segGap * (n - 1)) / n
  }

  private layout(view: ViewState, box: PxRect, sw: number) {
    const h = SPACING.segHeight
    const top = view.runKind === "top"
    this.segments.forEach((seg, i) => {
      const n = i + 1
      const x = i * (sw + SPACING.segGap)
      const current = n === view.runSection
      const past = n > view.runStop
      place(seg.object, pointInPanelCm(box, x + sw / 2, h / 2), Z)
      setRectSize(seg.rect, sw, h, RADII.segment)
      // Played: filled. Playing or still to come: a soft track. Out of the run: an outline.
      seg.rect.backgroundColor = themeColor(past ? "panel" : n < view.runSection ? "stroke" : "soft")
      seg.rect.border = past
      seg.rect.borderColor = themeColor("ghostLine")
      seg.fillObject.enabled = false

      const stop = top && n === view.runStop ? " · STOP" : ""
      seg.label.text = current ? `${n} ▸${stop}` : `${n}${stop}`
      seg.label.textFill.color = themeColor(current ? "ink" : past ? "muted" : "ink2")
      place(seg.labelObject, pointInPanelCm(box, x, SPACING.segLabelY), Z)
    })
  }

  private build(sectionCount: number) {
    this.segments.forEach((s) => [s.object, s.fillObject, s.labelObject].forEach((o) => o.destroy()))
    this.segments = []
    for (let n = 1; n <= sectionCount; n++) {
      const object = childObject(`Segment ${n}`, this.sceneObject)
      const rect = makeRect(object, "soft", 1)
      rect.borderSize = pxToCm(1)
      const fillObject = childObject(`Fill ${n}`, this.sceneObject)
      const fill = makeRect(fillObject, "stroke", 2)
      const labelObject = childObject(`Label ${n}`, this.sceneObject)
      const label = makeText(labelObject, TYPE.segLabel, "ink2", 2, "left")
      this.segments.push({ object, rect, fillObject, fill, labelObject, label })
    }
    this.box = null
  }
}
