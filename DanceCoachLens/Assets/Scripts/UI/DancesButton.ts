/**
 * DancesButton: "‹ Dances" at the top-left of the board, to go back to the list and pick another dance.
 *
 * Not in the B2 handoff, so it's built from the kit's Button (kit/components/Button.md): a 56-tall secondary pill
 * (control fill), a 24 ‹ icon and white Sora 16/24 600, padding 0 20, icon-to-label gap 8. Secondary, not volt:
 * leaving isn't the main next step on any screen.
 *
 * It sits level with the top of the video, a surface gap (24) left of Lookback's side panel (x 468), so it's clear
 * of the side panel, side by side's take, the toast, the dialogs and the count-in on every screen.
 *
 * A pinch calls onPress. A shallow view: the main script enables it while a dance is playing.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { PxRect, pointInPanelCm, pxToCm } from "./Layout"
import { SIZE, SPACE } from "./Theme"
import { addHover, childObject, makeIcon, makePill, makeText, place } from "./Visuals"

const LABEL = "Dances"
// Side padding (space-5): the kit's Button.
const PAD = 20
// "Dances" in Sora 16 600, rounded up.
const LABEL_W = 58
const W = PAD + SIZE.icon + SPACE.group + LABEL_W + PAD
// The side panel's left edge, less the gap between surfaces.
const RIGHT = 468 - SPACE.surface
const BOX: PxRect = [RIGHT - W, 40, W, SIZE.control]
const Z = 0.2
const Z_CONTENT = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1

@component
export class DancesButton extends BaseScriptComponent {
  /** Called when the button is pinched. */
  onPress: () => void = () => {}

  onAwake() {
    const [, , w, h] = BOX
    const button = childObject("Button", this.sceneObject)
    const rect = makePill(button, "control", 2, w, h)

    // The icon and label are centred as a group: the label's centre sits half the icon and gap right of the
    // button's, with centre-aligned text like every other button, so a wrong guess at its width can't push it off.
    const shift = (SIZE.icon + SPACE.group) / 2
    const label = childObject("Label", button)
    label.getTransform().setLocalPosition(new vec3(pxToCm(shift), 0, Z_CONTENT))
    makeText(label, "button", "text", 3).text = LABEL

    const icon = makeIcon(button, "back", "text", 3)
    icon.object.getTransform().setLocalPosition(new vec3(pxToCm(shift - LABEL_W / 2 - SPACE.group - SIZE.icon / 2), 0, Z_CONTENT))

    place(button, pointInPanelCm(BOX, w / 2, h / 2), Z)

    const collider = button.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(w), pxToCm(h), HIT_DEPTH)
    collider.shape = shape
    const interactable = button.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(() => this.onPress())
    addHover(button, rect)
  }
}
