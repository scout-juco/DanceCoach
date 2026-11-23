/**
 * WindowResize: L-brackets on the video's top-left and bottom-right corners (BUILD_SPEC §6.5);
 * pinch one and pull to resize the whole window.
 *
 * The window root scales about its centre, so the section row, mode panel and every other
 * panel on the window plane scale with the video. Each bracket sits 16 px outside its corner, with
 * 28 px legs of 4 px stroke in #9EA3AA. Calls onResized when you let go.
 * render() hides the brackets while the controls are locked, so a dance move can't resize it.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { LookbackView } from "../Core/LookbackController"
import { overlayFor } from "../Core/Overlay"
import { PoseView } from "../Core/PoseController"
import { ViewState } from "../Core/PlaybackController"
import { resizedScale } from "../Core/WindowPlacement"
import { pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { childObject, makeRect, place, setRectSize, themeColor } from "./Visuals"

// In front of the grab area, so a pinch on a corner resizes rather than moves.
const Z = 1.5
// Collider depth, in cm.
const HIT_DEPTH = 2
// The pinchable square around each bracket, and the bracket's own size: legs 28 long, 4 stroke, 16 outside the corner (prototype px).
const HIT_PX = 48
const LEG_PX = 28
const THICK_PX = 4
const OUT_PX = 16

/** side: -1 for the top-left corner, 1 for the bottom-right: the way the bracket points outwards. */
type Corner = { object: SceneObject; side: -1 | 1 }

@component
export class WindowResize extends BaseScriptComponent {
  /** Called every frame while the window is being resized. */
  onResizing: () => void = () => {}
  /** Called when the corner is let go. */
  onResized: () => void = () => {}

  private root: Transform
  private corners: Corner[] = []
  private rect: PxRect | null = null
  private startScale = 1
  private startDistCm = 0

  /** Pinching a corner scales `root`. */
  setup(root: SceneObject) {
    this.root = root.getTransform()
    this.corners = [this.makeCorner("TopLeft", -1), this.makeCorner("BottomRight", 1)]
  }

  /** Puts the brackets on the video's top-left and bottom-right corners (rect in prototype pixels). */
  setRect(rect: PxRect) {
    if (this.rect && rect.every((v, i) => v === this.rect![i])) return
    this.rect = rect
    for (const c of this.corners) place(c.object, pointInPanelCm(rect, c.side < 0 ? 0 : rect[2], c.side < 0 ? 0 : rect[3]), Z)
  }

  /** Shows the brackets only where overlayFor() says (unlocked, nothing in front of the window). */
  render(view: ViewState, pose: PoseView | null = null, look: LookbackView | null = null) {
    this.sceneObject.enabled = overlayFor(view, pose, look).handles
  }

  private makeCorner(name: string, side: -1 | 1): Corner {
    const object = childObject(name, this.sceneObject)
    // An L that opens towards the video: its outer edges are OUT_PX outside the corner. Outwards is left and up
    // for the top-left bracket, right and down for the bottom-right (y is up here).
    const ox = side
    const oy = -side
    const arm = (armName: string, x: number, y: number, w: number, h: number) => {
      const o = childObject(armName, object)
      const r = makeRect(o, "textSubtle", 4)
      setRectSize(r, w, h, THICK_PX / 2)
      o.getTransform().setLocalPosition(new vec3(pxToCm(x), pxToCm(y), 0))
      return r
    }
    const mid = OUT_PX - LEG_PX / 2
    const edge = OUT_PX - THICK_PX / 2
    const arms: RoundedRectangle[] = [
      arm("Horizontal", ox * mid, oy * edge, LEG_PX, THICK_PX),
      arm("Vertical", ox * edge, oy * mid, THICK_PX, LEG_PX),
    ]

    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(HIT_PX), pxToCm(HIT_PX), HIT_DEPTH)
    collider.shape = shape
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    const tint = (token: "textSubtle" | "text") => arms.forEach((a) => (a.backgroundColor = themeColor(token)))
    interactable.onHoverEnter.add(() => tint("text"))
    interactable.onHoverExit.add(() => tint("textSubtle"))
    interactable.onTriggerStart.add((e) => this.begin(e))
    interactable.onTriggerUpdate.add((e) => this.update(e))
    interactable.onTriggerEnd.add(() => this.onResized())
    interactable.onTriggerCanceled.add(() => this.onResized())
    return { object, side }
  }

  private begin(e: InteractorEvent) {
    this.startScale = this.root.getLocalScale().x
    this.startDistCm = this.distFromCentre(e)
  }

  private update(e: InteractorEvent) {
    const scale = resizedScale(this.startScale, this.startDistCm, this.distFromCentre(e))
    this.root.setLocalScale(new vec3(scale, scale, scale))
    this.onResizing()
  }

  /** How far the pinch point is from the window's centre, on the window plane. NaN if the ray misses it. */
  private distFromCentre(e: InteractorEvent): number {
    const p = e.interactor.planecastPoint
    if (!p) return NaN
    return p.distance(this.root.getWorldPosition())
  }
}
