/**
 * Toast: a short message in a pill, such as "Pose and Lookback are coming soon".
 *
 * A shallow view: render() shows the view state's toast, placed by the screen's toast
 * panel in Layout.SCREENS. Hidden when there's no toast or the screen has no place for one.
 */
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, SCREENS } from "./Layout"
import { TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize } from "./Visuals"

// In front of the other panels, in cm.
const Z = 0.4

@component
export class Toast extends BaseScriptComponent {
  private pill: SceneObject
  private text: Text
  private lastText: string | null = null
  private screen = ""

  onAwake() {
    this.pill = childObject("Pill", this.sceneObject)
    const rect = makeRect(this.pill, "active", 5)
    const box = SCREENS.C.toast!
    setRectSize(rect, box[2], box[3], box[3] / 2)
    const textObject = childObject("Text", this.pill)
    textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    this.text = makeText(textObject, TYPE.toast, "activeInk", 6)
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const box = panelsFor(view).toast
    const show = !!view.toast && !!box
    this.sceneObject.enabled = show
    if (!show) return
    if (view.screen !== this.screen) {
      this.screen = view.screen
      place(this.pill, pointInPanelCm(box!, box![2] / 2, box![3] / 2), Z)
    }
    if (view.toast !== this.lastText) {
      this.lastText = view.toast
      this.text.text = view.toast!
    }
  }
}
