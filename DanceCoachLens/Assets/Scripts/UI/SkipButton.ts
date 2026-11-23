/**
 * SkipButton: "Skip to Section 1 ›" during the first look (A1): a 56-tall secondary pill (control fill, Sora 16/24 600),
 * 24 under the section bar and right-aligned to the video (Layout.SCREENS.PV.skip).
 *
 * A pinch calls onPress. A shallow view: render() shows it on screens with a skip panel
 * (Layout.SCREENS), so it can only be pressed during the first look.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm, SCREENS } from "./Layout"
import { childObject, makePill, makeText, place } from "./Visuals"

const Z = 0.2
// Collider depth, in cm.
const HIT_DEPTH = 1

@component
export class SkipButton extends BaseScriptComponent {
  /** Called when the button is pinched. */
  onPress: () => void = () => {}

  private button: SceneObject
  private screen = ""

  onAwake() {
    const [, , w, h] = SCREENS.PV.skip!
    this.button = childObject("Button", this.sceneObject)
    makePill(this.button, "control", 2, w, h)
    const label = childObject("Label", this.button)
    label.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    makeText(label, "button", "text", 3).text = "Skip to Section 1 ›"

    const collider = this.button.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(w), pxToCm(h), HIT_DEPTH)
    collider.shape = shape
    const interactable = this.button.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(() => this.onPress())
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const box = panelsFor(view).skip
    this.sceneObject.enabled = !!box
    if (!box || view.screen === this.screen) return
    this.screen = view.screen
    place(this.button, pointInPanelCm(box, box[2] / 2, box[3] / 2), Z)
  }
}
