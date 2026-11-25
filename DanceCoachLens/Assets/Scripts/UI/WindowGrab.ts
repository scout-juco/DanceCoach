/**
 * WindowGrab: pinch the video to drag the whole window somewhere else.
 *
 * It moves the window root (translation only; the Lens turns it to face you) and calls
 * onMoved when you let go, so the placement can be saved. Resizing is WindowResize.
 * render() turns it off (and its hover tint with it) while the padlock shows.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import { LookbackView } from "../Core/LookbackController"
import { overlayFor } from "../Core/Overlay"
import { ViewState } from "../Core/PlaybackController"
import { PoseView } from "../Core/PoseController"
import { panelCm, PxRect } from "./Layout"
import { RADIUS } from "./Theme"
import { addHover } from "./Visuals"

// Collider depth, in cm.
const HIT_DEPTH = 2

@component
export class WindowGrab extends BaseScriptComponent {
  /** Called every frame while the window is being dragged. */
  onMoving: () => void = () => {}
  /** Called when the window is let go. */
  onMoved: () => void = () => {}

  /** Off while the controls are locked (a clip playing or counting in), so a dance move can't drag the window. */
  render(view: ViewState, pose: PoseView | null = null, look: LookbackView | null = null) {
    this.sceneObject.enabled = !overlayFor(view, pose, look).lock
  }

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
    // The video lights up a little under the hand, to say it can be picked up.
    addHover(this.sceneObject, { wPx: rect[2], hPx: rect[3], radiusPx: RADIUS.lg, order: 2, alpha: 0.07 })
    const manipulation = this.sceneObject.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    manipulation.setManipulateRoot(root.getTransform())
    manipulation.setCanRotate(false)
    manipulation.setCanScale(false)
    manipulation.onManipulationUpdate.add(() => this.onMoving())
    manipulation.onManipulationEnd.add(() => this.onMoved())
  }
}
