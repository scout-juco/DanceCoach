/**
 * ProgressBar: the thin bar under the video during a run.
 *
 * During a count-in it marks where the section starts on 1: at the very start for a
 * starting pose, after the lead-in otherwise, with a label under the mark. While the
 * section plays it fills with the run's progress.
 * A shallow view: render() shows the view state, placed by the screen's progress and
 * progLabel panels in Layout.SCREENS.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { pointInPanelCm, PxRect, SCREENS } from "./Layout"
import { RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize } from "./Visuals"

const Z = 0.1
// The fill and lead-in sit just in front of the track, the marker in front of both.
const Z_FILL = 0.12
const Z_MARK = 0.14
// The marker pokes out of the bar by this much above and below (prototype px).
const MARK_OVERHANG = 4

@component
export class ProgressBar extends BaseScriptComponent {
  private track: RoundedRectangle
  private trackObject: SceneObject
  private fill: RoundedRectangle
  private fillObject: SceneObject
  private lead: RoundedRectangle
  private leadObject: SceneObject
  private markObject: SceneObject
  private mark: RoundedRectangle
  private leadLabelObject: SceneObject
  private startLabelObject: SceneObject
  private startLabel: Text
  private lastFillPx = -1

  onAwake() {
    this.trackObject = childObject("Track", this.sceneObject)
    this.track = makeRect(this.trackObject, "track", 1)
    this.leadObject = childObject("LeadIn", this.sceneObject)
    this.lead = makeRect(this.leadObject, "soft", 2)
    this.fillObject = childObject("Fill", this.sceneObject)
    this.fill = makeRect(this.fillObject, "muted", 2)
    this.markObject = childObject("StartsOn1", this.sceneObject)
    this.mark = makeRect(this.markObject, "ink", 3)

    this.leadLabelObject = childObject("LeadInLabel", this.sceneObject)
    makeText(this.leadLabelObject, TYPE.progLabel, "ink2", 2, "left").text = "LEAD-IN"
    this.startLabelObject = childObject("StartLabel", this.sceneObject)
    this.startLabel = makeText(this.startLabelObject, TYPE.progLabel, "ink", 2, "left")
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const rects = SCREENS[view.screen]
    const bar = rects.progress
    this.sceneObject.enabled = !!bar
    if (!bar) return
    const [, , w, h] = bar
    place(this.trackObject, pointInPanelCm(bar, w / 2, h / 2), Z)
    setRectSize(this.track, w, h, RADII.progress)

    const counting = !!view.countIn
    this.markObject.enabled = counting
    this.leadObject.enabled = counting && view.leadInFraction > 0
    this.fillObject.enabled = !counting
    this.leadLabelObject.enabled = counting && view.leadInFraction > 0
    this.startLabelObject.enabled = counting && !!rects.progLabel

    if (counting) {
      const markX = w * view.leadInFraction
      if (markX > 0) {
        place(this.leadObject, pointInPanelCm(bar, markX / 2, h / 2), Z_FILL)
        setRectSize(this.lead, markX, h, RADII.progress)
      }
      place(this.markObject, pointInPanelCm(bar, markX, h / 2), Z_MARK)
      setRectSize(this.mark, SPACING.progressMarker, h + MARK_OVERHANG * 2)
      this.renderLabels(view, rects.progLabel, markX)
      this.lastFillPx = -1
      return
    }

    // Fill to whole pixels so the rectangle isn't rebuilt every frame.
    const fillPx = Math.round(w * view.runProgress)
    if (fillPx === this.lastFillPx) return
    this.lastFillPx = fillPx
    this.fillObject.enabled = fillPx > 0
    if (fillPx > 0) {
      const fw = Math.max(h, fillPx)
      place(this.fillObject, pointInPanelCm(bar, fw / 2, h / 2), Z_FILL)
      setRectSize(this.fill, fw, h, RADII.progress)
    }
  }

  private renderLabels(view: ViewState, label: PxRect | undefined, markX: number) {
    if (!label) return
    const y = label[3] / 2
    place(this.leadLabelObject, pointInPanelCm(label, 0, y), Z)
    this.startLabel.text = `SECTION ${view.section} STARTS ON 1`
    place(this.startLabelObject, pointInPanelCm(label, markX > 0 ? markX - 4 : 0, y), Z)
  }
}
