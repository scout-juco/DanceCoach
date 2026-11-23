/**
 * RecordCountdown: "RECORDING IN" 03 02 01 beside the video while a take is armed (screen K), in pink,
 * and "SAVING TAKE…" once the section has played out.
 *
 * The same column as the count-in (CountColumn), in pink, on the board 32 left of the video. A shallow view:
 * render() shows the Lookback view, placed by the screen's countdown panel in Layout.SCREENS; hidden on screens without one.
 */
import { LookbackView } from "../Core/LookbackController"
import { ViewState } from "../Core/PlaybackController"
import { CountColumn } from "./CountColumn"
import { panelsFor, pointInPanelCm } from "./Layout"
import { childObject, place } from "./Visuals"

const Z = 0.1
const COUNTS = [3, 2, 1]

@component
export class RecordCountdown extends BaseScriptComponent {
  private column: CountColumn
  private columnObject: SceneObject
  private lastKey = ""

  onAwake() {
    this.columnObject = childObject("Column", this.sceneObject)
    this.column = new CountColumn(this.columnObject, COUNTS, "pink")
    this.sceneObject.enabled = false
  }

  render(view: ViewState, look: LookbackView | null) {
    const box = panelsFor(view).countdown
    const record = look ? look.record : null
    // Up for the count and for "Saving take…"; while the section plays it's the video and its REC chip.
    const show = !!box && !!record && (record.phase === "arming" || record.phase === "countdown" || record.phase === "saving")
    this.sceneObject.enabled = show
    if (!show || !box || !record) return
    const key = `${box[1]}|${record.phase}|${record.countdown}`
    if (key === this.lastKey) return
    this.lastKey = key
    place(this.columnObject, pointInPanelCm(box, box[2] / 2, box[3] / 2), Z)
    const saving = record.phase === "saving"
    this.column.setEyebrow(saving ? "SAVING TAKE…" : "RECORDING IN")
    this.column.showRows(!saving)
    if (!saving) this.column.setNumber(record.countdown)
  }
}
