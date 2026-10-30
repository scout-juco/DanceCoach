/**
 * PoseLine: the thin scrub line under the video in Pose, with its label,
 * "SECTION 2 · COUNT 5&". It fills to the step on show across the section's 8 counts.
 *
 * A shallow view: render() shows the Pose view, placed by the screen's poseLine panel
 * in Layout.SCREENS. Hidden on screens without one. `aimed` says whether the hand ray is on the line
 * (a taller area than the line itself, so it's easy to reach), which opens the Pose bar.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { STILLS_PER_SECTION } from "../Core/DancePackage"
import { PoseView, scrubLabel } from "../Core/PoseController"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm } from "./Layout"
import { RADII, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize } from "./Visuals"

const Z = 0.1
const Z_FILL = 0.12
// The label's centre sits this far below the line's middle (prototype px).
const LABEL_DOWN = 20
// The aim area is this tall (prototype px), centred on the line, and this deep (cm).
const AIM_HEIGHT = 56
const HIT_DEPTH = 1

@component
export class PoseLine extends BaseScriptComponent {
  private track: RoundedRectangle
  private trackObject: SceneObject
  private fill: RoundedRectangle
  private fillObject: SceneObject
  private labelObject: SceneObject
  private label: Text
  private lastKey = ""
  private hovered = false
  private aimObject: SceneObject
  private collider: ColliderComponent

  /** True while the hand ray is on the line. */
  get aimed(): boolean {
    return this.hovered
  }

  onAwake() {
    this.aimObject = childObject("Aim", this.sceneObject)
    this.collider = this.aimObject.createComponent("ColliderComponent") as ColliderComponent
    this.collider.fitVisual = false
    const interactable = this.aimObject.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onHoverEnter.add(() => (this.hovered = true))
    interactable.onHoverExit.add(() => (this.hovered = false))
    this.trackObject = childObject("Track", this.sceneObject)
    this.track = makeRect(this.trackObject, "track", 1)
    this.fillObject = childObject("Fill", this.sceneObject)
    this.fill = makeRect(this.fillObject, "muted", 2)
    this.labelObject = childObject("Label", this.sceneObject)
    this.label = makeText(this.labelObject, TYPE.banner, "ink2", 2)
    this.sceneObject.enabled = false
  }

  render(view: ViewState, pose: PoseView | null) {
    const bar = panelsFor(view).poseLine
    this.sceneObject.enabled = !!bar && !!pose
    if (!bar || !pose) {
      this.lastKey = ""
      // A hidden line sends no hover-exit.
      this.hovered = false
      return
    }
    const [, , w, h] = bar
    const text = scrubLabel(pose)
    // Rebuilt only when the step changes, not every frame.
    const key = `${bar.join(",")}|${text}`
    if (key === this.lastKey) return
    this.lastKey = key
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(w), pxToCm(AIM_HEIGHT), HIT_DEPTH)
    this.collider.shape = shape
    place(this.aimObject, pointInPanelCm(bar, w / 2, h / 2), Z)
    place(this.trackObject, pointInPanelCm(bar, w / 2, h / 2), Z)
    setRectSize(this.track, w, h, RADII.progress)
    const fw = Math.max(h, (w * (pose.step + 1)) / STILLS_PER_SECTION)
    place(this.fillObject, pointInPanelCm(bar, fw / 2, h / 2), Z_FILL)
    setRectSize(this.fill, fw, h, RADII.progress)
    place(this.labelObject, pointInPanelCm(bar, w / 2, h / 2 + LABEL_DOWN), Z_FILL)
    this.label.text = text
  }
}
