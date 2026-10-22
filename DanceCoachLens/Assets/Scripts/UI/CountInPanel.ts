/**
 * CountInPanel: the 5, 6, 7, 8 beside the video (never on it) before every run.
 *
 * A shallow view: render() shows the view state's count-in, placed by the screen's
 * countIn and ciHead panels in Layout.SCREENS. The starting pose adds a
 * "Get in your starting pose" heading above the circle.
 */
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm } from "./Layout"
import { SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, runLabel, setRectSize, themeColor } from "./Visuals"

const Z = 0.1
const COUNT_IN = [5, 6, 7, 8]

@component
export class CountInPanel extends BaseScriptComponent {
  private head: SceneObject
  private circle: SceneObject
  private number: Text
  private label: Text
  private rowObjects: SceneObject[] = []
  private row: Text[] = []
  private layoutKey = ""

  onAwake() {
    this.head = childObject("StartingPose", this.sceneObject)
    makeText(this.head, TYPE.countInHead, "ink", 2).text = "GET IN YOUR STARTING POSE"

    this.circle = childObject("Circle", this.sceneObject)
    setRectSize(makeRect(this.circle, "active", 1), SPACING.countInCircle, SPACING.countInCircle, SPACING.countInCircle / 2)
    const numberObject = childObject("Number", this.circle)
    this.number = makeText(numberObject, TYPE.countInNumber, "activeInk", 2)
    const labelObject = childObject("Label", this.circle)
    this.label = makeText(labelObject, TYPE.countInLabel, "activeInk", 2)
    // Inside the circle: the number a little above centre, the label near the bottom (prototype: 92 and 160 of 200).
    const r = SPACING.countInCircle / 2
    numberObject.getTransform().setLocalPosition(new vec3(0, pxToCm(r - 92), 0.05))
    labelObject.getTransform().setLocalPosition(new vec3(0, pxToCm(r - 160), 0.05))

    for (const n of COUNT_IN) {
      const so = childObject(`Count${n}`, this.sceneObject)
      const text = makeText(so, TYPE.countIn, "soft", 2)
      text.text = String(n)
      this.rowObjects.push(so)
      this.row.push(text)
    }
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const ci = view.countIn
    const rects = panelsFor(view)
    const show = !!ci && !!rects.countIn
    this.sceneObject.enabled = show
    if (!show) {
      this.layoutKey = ""
      return
    }
    const key = `${view.screen}|${view.runKind}|${view.section}`
    if (key !== this.layoutKey) {
      this.layoutKey = key
      this.layout(view)
    }
    this.number.text = String(ci!.number)
    this.row.forEach((t, i) => (t.textFill.color = themeColor(COUNT_IN[i] === ci!.number ? "ink" : "soft")))
  }

  private layout(view: ViewState) {
    const rects = panelsFor(view)
    const box = rects.countIn!
    const w = box[2]
    place(this.circle, pointInPanelCm(box, w / 2, SPACING.countInCircle / 2), Z)
    this.rowObjects.forEach((so, i) => place(so, pointInPanelCm(box, w / 2 + (i - 1.5) * SPACING.countInRowGap, SPACING.countInRowY), Z))
    this.label.text = `${runLabel(view)} IN`
    const head = rects.ciHead
    this.head.enabled = view.countIn!.kind === "startingPose" && !!head
    if (head) place(this.head, pointInPanelCm(head, head[2] / 2, head[3] / 2), Z)
  }
}
