/**
 * RecordCountdown: the 3, 2, 1 "GET IN POSITION" beside the video while a take is armed (screen K),
 * and "SAVING TAKE…" once the section has played out.
 *
 * A filled circle with the number big in it. A shallow view: render() shows the Lookback view,
 * placed by the screen's countdown panel in Layout.SCREENS; hidden on screens without one.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { LookbackView } from "../Core/LookbackController"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm } from "./Layout"
import { TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize } from "./Visuals"

const Z = 0.1
const Z_ITEM = 0.05
// From the circle's centre (prototype px): the number sits above the label.
const NUMBER_UP = 8
const LABEL_DOWN = 58

@component
export class RecordCountdown extends BaseScriptComponent {
  private circle: SceneObject
  private disc: RoundedRectangle
  private number: Text
  private label: Text
  private numberObject: SceneObject
  private labelObject: SceneObject
  private lastKey = ""

  onAwake() {
    this.circle = childObject("Circle", this.sceneObject)
    this.disc = makeRect(this.circle, "active", 2)
    this.numberObject = childObject("Number", this.circle)
    this.number = makeText(this.numberObject, TYPE.countInNumber, "activeInk", 3)
    this.labelObject = childObject("Label", this.circle)
    this.label = makeText(this.labelObject, TYPE.countInLabel, "activeInk", 3)
    this.sceneObject.enabled = false
  }

  render(view: ViewState, look: LookbackView | null) {
    const box = panelsFor(view).countdown
    const record = look ? look.record : null
    // Up for the count and for "Saving take…"; while the section plays it's the video and its REC chip.
    const show = !!box && !!record && (record.phase === "arming" || record.phase === "countdown" || record.phase === "saving")
    this.sceneObject.enabled = show
    if (!show || !box || !record) return
    const key = `${box[2]}|${record.phase}|${record.countdown}`
    if (key === this.lastKey) return
    this.lastKey = key
    const [, , w, h] = box
    place(this.circle, pointInPanelCm(box, w / 2, h / 2), Z)
    setRectSize(this.disc, w, h, w / 2)
    const saving = record.phase === "saving"
    this.number.text = saving ? "" : String(record.countdown)
    this.label.text = saving ? "SAVING TAKE…" : "GET IN POSITION"
    this.numberObject.getTransform().setLocalPosition(new vec3(0, pxToCm(NUMBER_UP), Z_ITEM))
    this.labelObject.getTransform().setLocalPosition(new vec3(0, saving ? 0 : -pxToCm(LABEL_DOWN), Z_ITEM))
  }
}
