/**
 * ProgressBar: the bar 16 under the video during a single-section run (BUILD_SPEC §6.6).
 *
 * 8 tall, radius 4, a control track. During a count-in (B0) a 4×16 white marker shows where the section starts on 1,
 * with a caption 8 under the bar: "↑ Section 1" at the very start for a starting pose, or, after a lead-in, the striped
 * lead-in segment and "LEAD-IN  ↑ Section 2 starts on 1". While the section plays (B) it fills volt with the run's progress.
 * A shallow view: render() shows the view state, placed by the screen's progress panel in Layout.SCREENS.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, PxRect } from "./Layout"
import { RADIUS, SIZE, SPACE, TEXT } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize } from "./Visuals"

const Z = 0.1
// The fill and lead-in stripes sit just in front of the track, the marker in front of both.
const Z_FILL = 0.12
const Z_MARK = 0.14
// The start marker: 4 wide, 16 tall, poking 4 out of the bar above and below.
const MARK_W = 4
const MARK_H = 16
// The lead-in's stripes: 4 px of tick-off, then 4 px of the track showing through.
const STRIPE = 4
// "LEAD-IN" and its two spaces in Inter 14/400, measured from the font (64.3 px), so "↑ Section n starts on 1" follows it.
const LEAD_IN_WIDTH = 64
// The caption: Inter 14/20, 400 for "LEAD-IN" (subtle) and 700 for the rest (white).
const CAPTION_LIGHT = { ...TEXT.caption, weight: 400 as const }
const CAPTION_BOLD = { ...TEXT.caption, weight: 700 as const }

@component
export class ProgressBar extends BaseScriptComponent {
  private track: RoundedRectangle
  private trackObject: SceneObject
  private fill: RoundedRectangle
  private fillObject: SceneObject
  private stripes: { object: SceneObject; rect: RoundedRectangle }[] = []
  private markObject: SceneObject
  private leadInObject: SceneObject
  private startsObject: SceneObject
  private starts: Text
  private box: PxRect | null = null
  private lastFillPx = -1
  private countInKey = ""

  onAwake() {
    this.trackObject = childObject("Track", this.sceneObject)
    this.track = makeRect(this.trackObject, "control", 1)
    this.fillObject = childObject("Fill", this.sceneObject)
    this.fill = makeRect(this.fillObject, "volt", 2)
    this.markObject = childObject("StartsOn1", this.sceneObject)
    setRectSize(makeRect(this.markObject, "text", 3), MARK_W, MARK_H, MARK_W / 2)
    this.leadInObject = childObject("LeadInLabel", this.sceneObject)
    makeText(this.leadInObject, CAPTION_LIGHT, "textSubtle", 2, "left").text = "LEAD-IN"
    this.startsObject = childObject("StartsLabel", this.sceneObject)
    this.starts = makeText(this.startsObject, CAPTION_BOLD, "text", 2, "left")
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const bar = panelsFor(view).progress
    this.sceneObject.enabled = !!bar
    if (!bar) {
      this.box = null
      return
    }
    const [, , w, h] = bar
    if (bar !== this.box) {
      this.box = bar
      this.countInKey = ""
      this.lastFillPx = -1
      place(this.trackObject, pointInPanelCm(bar, w / 2, h / 2), Z)
      setRectSize(this.track, w, h, RADIUS.sm)
    }

    const counting = !!view.countIn
    this.markObject.enabled = counting
    this.leadInObject.enabled = counting && view.leadInFraction > 0
    this.startsObject.enabled = counting
    if (counting) {
      this.fillObject.enabled = false
      this.lastFillPx = -1
      this.renderCountIn(view, bar)
      return
    }
    this.countInKey = ""
    this.showStripes(0, bar)

    // Fill to whole pixels so the rectangle isn't rebuilt every frame.
    const fillPx = Math.round(w * view.runProgress)
    if (fillPx === this.lastFillPx) return
    this.lastFillPx = fillPx
    this.fillObject.enabled = fillPx > 0
    if (fillPx > 0) {
      const fw = Math.max(h, fillPx)
      place(this.fillObject, pointInPanelCm(bar, fw / 2, h / 2), Z_FILL)
      setRectSize(this.fill, fw, h, RADIUS.sm)
    }
  }

  /** B0: the lead-in stripes up to the marker, the marker, and the caption 8 under the bar. Laid out once per count-in. */
  private renderCountIn(view: ViewState, bar: PxRect) {
    const key = `${view.runSection}|${view.leadInFraction}`
    if (key === this.countInKey) return
    this.countInKey = key
    const [, , w, h] = bar
    const markX = Math.round(w * view.leadInFraction)
    const lead = markX > 0
    this.showStripes(markX, bar)
    place(this.markObject, pointInPanelCm(bar, markX, h / 2), Z_MARK)

    const captionY = h + SPACE.group + TEXT.caption.lineHeight / 2
    place(this.leadInObject, pointInPanelCm(bar, 0, captionY), Z)
    place(this.startsObject, pointInPanelCm(bar, lead ? LEAD_IN_WIDTH : 0, captionY), Z)
    this.starts.text = lead ? `↑ Section ${view.runSection} starts on 1` : `↑ Section ${view.runSection}`
  }

  /** The striped lead-in from the bar's start to x (px): tick-off stripes 4 wide, every 8. None for x = 0. */
  private showStripes(x: number, bar: PxRect) {
    const count = x > 0 ? Math.ceil(x / (STRIPE * 2)) : 0
    while (this.stripes.length < count) {
      const object = childObject(`Stripe ${this.stripes.length + 1}`, this.sceneObject)
      this.stripes.push({ object, rect: makeRect(object, "tickOff", 2) })
    }
    const h = SIZE.bar
    this.stripes.forEach((s, i) => {
      s.object.enabled = i < count
      if (i >= count) return
      const left = i * STRIPE * 2
      const sw = Math.min(STRIPE, x - left)
      // The first stripe rounds off with the bar's end.
      setRectSize(s.rect, sw, h, i === 0 ? sw / 2 : 0)
      place(s.object, pointInPanelCm(bar, left + sw / 2, h / 2), Z_FILL)
    })
  }
}
