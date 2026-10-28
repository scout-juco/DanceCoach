/**
 * DancesButton: "‹ Dances" at the top-left of the board, to go back to the list and pick another dance.
 *
 * A pinch calls onPress. It sits left of the video on every screen, clear of the toast and the controls.
 * A shallow view: the main script enables it while a dance is playing.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { PxRect, pointInPanelCm, pxToCm } from "./Layout"
import { RADII, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

// Prototype px on the board: left of the video (which starts at x 790), above the toast.
const BOX: PxRect = [360, 40, 120, 36]
const Z = 0.2
// Collider depth, in cm.
const HIT_DEPTH = 1

@component
export class DancesButton extends BaseScriptComponent {
  /** Called when the button is pinched. */
  onPress: () => void = () => {}

  onAwake() {
    const [, , w, h] = BOX
    const button = childObject("Button", this.sceneObject)
    const rect = makeRect(button, "panel", 2)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("stroke")
    setRectSize(rect, w, h, RADII.button)
    const label = childObject("Label", button)
    label.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    makeText(label, TYPE.button, "ink", 3).text = "‹  Dances"
    place(button, pointInPanelCm(BOX, w / 2, h / 2), Z)

    const collider = button.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(w), pxToCm(h), HIT_DEPTH)
    collider.shape = shape
    const interactable = button.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(() => this.onPress())
  }
}
