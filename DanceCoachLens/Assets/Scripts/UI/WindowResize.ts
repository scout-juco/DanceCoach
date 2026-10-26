/**
 * WindowResize: corner handles on the video; pinch one and pull to resize the whole window.
 *
 * The window root scales about its centre, so the section row, control bar and every other
 * panel on the window plane scale with the video. Only the top corners have handles: the
 * bottom ones sit too close to the section row on Clip ended. Calls onResized when you let go.
 * render() hides the handles while the controls are locked, so a dance move can't resize it.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { ViewState } from "../Core/PlaybackController"
import { resizedScale } from "../Core/WindowPlacement"
import { pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { childObject, makeRect, place, setRectSize, themeColor } from "./Visuals"

// In front of the grab area, so a pinch on a corner resizes rather than moves.
const Z = 1.5
// Collider depth, in cm.
const HIT_DEPTH = 2
// The pinchable square around each corner, and the L bracket drawn just outside it (prototype px).
const HIT_PX = 48
const ARM_PX = 22
const THICK_PX = 4
const GAP_PX = 6

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
    this.corners = [this.makeCorner("TopLeft", -1), this.makeCorner("TopRight", 1)]
  }

  /** Puts the handles on the top corners of the video's rect (prototype pixels). */
  setRect(rect: PxRect) {
    if (this.rect && rect.every((v, i) => v === this.rect![i])) return
    this.rect = rect
    for (const c of this.corners) place(c.object, pointInPanelCm(rect, c.side < 0 ? 0 : rect[2], 0), Z)
  }

  /** Shows the handles only while the controls are unlocked. */
  render(view: ViewState) {
    this.sceneObject.enabled = !view.controlsLocked
  }

  private makeCorner(name: string, side: -1 | 1): Corner {
    const object = childObject(name, this.sceneObject)
    // An L that opens towards the video: one arm along the top edge, one down the side.
    const arm = (armName: string, x: number, y: number, w: number, h: number) => {
      const o = childObject(armName, object)
      const r = makeRect(o, "stroke", 4)
      setRectSize(r, w, h, THICK_PX / 2)
      o.getTransform().setLocalPosition(new vec3(pxToCm(x), pxToCm(y), 0))
      return r
    }
    const out = GAP_PX + THICK_PX / 2
    const arms: RoundedRectangle[] = [
      arm("Top", side * (out - ARM_PX / 2 + THICK_PX / 2), out, ARM_PX, THICK_PX),
      arm("Side", side * out, out - ARM_PX / 2 + THICK_PX / 2, THICK_PX, ARM_PX),
    ]

    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(HIT_PX), pxToCm(HIT_PX), HIT_DEPTH)
    collider.shape = shape
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    const tint = (token: "stroke" | "ink") => arms.forEach((a) => (a.backgroundColor = themeColor(token)))
    interactable.onHoverEnter.add(() => tint("ink"))
    interactable.onHoverExit.add(() => tint("stroke"))
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
