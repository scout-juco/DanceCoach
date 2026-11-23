/**
 * PoseLine: the thin scrub under the video in Pose (screen D, BUILD_SPEC §6.11).
 *
 * 8 tall with white progress on the grey track and a 4×16 volt playhead, 24 under the video. Under it, 8 down,
 * "SECTION 2 · COUNT 5&" on the left and "reach here for controls" on the right, in Inter 12.
 *
 * A shallow view: render() shows the Pose view, placed by the screen's poseLine panel in Layout.SCREENS.
 * Hidden on screens without one. `aimed` says whether the hand ray is on the line (a taller area than the line
 * itself, so it's easy to reach), which opens the mode panel with the scrub (E).
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { STILLS_PER_SECTION } from "../Core/DancePackage"
import { PoseView, scrubLabel } from "../Core/PoseController"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm } from "./Layout"
import { RADIUS, SPACE } from "./Theme"
import { childObject, makePill, makeText, place, setRectSize } from "./Visuals"

const Z = 0.1
const Z_FILL = 0.12
const Z_HEAD = 0.14
// The aim area is this tall (prototype px), centred on the line, and this deep (cm).
const AIM_HEIGHT = 56
const HIT_DEPTH = 1
// The playhead (§6.11): 4 wide, 16 tall.
const HEAD = { w: 4, h: 16 }
// The captions' centre sits this far below the line's bottom edge: the 8 caption gap plus half their 16 line.
const CAPTION_DOWN = SPACE.group + 8
const HINT = "reach here for controls"

@component
export class PoseLine extends BaseScriptComponent {
  private track: RoundedRectangle
  private trackObject: SceneObject
  private fill: RoundedRectangle
  private fillObject: SceneObject
  private headObject: SceneObject
  private labelObject: SceneObject
  private label: Text
  private hintObject: SceneObject
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
    this.track = makePill(this.trackObject, "control", 1, 100, 8)
    this.fillObject = childObject("Fill", this.sceneObject)
    this.fill = makePill(this.fillObject, "text", 2, 100, 8)
    this.headObject = childObject("Playhead", this.sceneObject)
    makePill(this.headObject, "volt", 3, HEAD.w, HEAD.h)
    this.labelObject = childObject("Label", this.sceneObject)
    this.label = makeText(this.labelObject, "label", "textMuted", 2, "left")
    this.hintObject = childObject("Hint", this.sceneObject)
    makeText(this.hintObject, "label", "textMuted", 2, "right").text = HINT
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
    setRectSize(this.track, w, h, RADIUS.sm)
    // White to the playhead's centre, as on the open scrub.
    const x = (w * (pose.step + 0.5)) / STILLS_PER_SECTION
    place(this.fillObject, pointInPanelCm(bar, x / 2, h / 2), Z_FILL)
    setRectSize(this.fill, x, h, RADIUS.sm)
    place(this.headObject, pointInPanelCm(bar, x, h / 2), Z_HEAD)
    place(this.labelObject, pointInPanelCm(bar, 0, h + CAPTION_DOWN), Z_FILL)
    place(this.hintObject, pointInPanelCm(bar, w, h + CAPTION_DOWN), Z_FILL)
    this.label.text = text
  }
}
