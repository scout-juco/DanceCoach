/**
 * WindowGrab: pinch the video to drag the whole window somewhere else.
 *
 * It moves the window root (translation only; the Lens turns it to face you) and calls
 * onMoved when you let go, so the placement can be saved. Resizing is WindowResize.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import { panelCm, PxRect } from "./Layout"

// Collider depth, in cm.
const HIT_DEPTH = 2

@component
export class WindowGrab extends BaseScriptComponent {
  /** Called every frame while the window is being dragged. */
  onMoving: () => void = () => {}
  /** Called when the window is let go. */
  onMoved: () => void = () => {}

  /**
   * Makes the area `rect` (prototype pixels) grabbable; dragging it moves `root`.
   * The rect should sit inside the video on every screen, so it never covers a button.
   */
  setup(root: SceneObject, rect: PxRect) {
    const r = panelCm(rect)
    this.sceneObject.getTransform().setLocalPosition(new vec3(r.x, r.y, 0))
    const collider = this.sceneObject.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(r.w, r.h, HIT_DEPTH)
    collider.shape = shape

    this.sceneObject.createComponent(Interactable.getTypeName())
    const manipulation = this.sceneObject.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    manipulation.setManipulateRoot(root.getTransform())
    manipulation.setCanRotate(false)
    manipulation.setCanScale(false)
    manipulation.onManipulationUpdate.add(() => this.onMoving())
    manipulation.onManipulationEnd.add(() => this.onMoved())
  }
}
