/**
 * DialogButton: a pressable pill or card on a dialog (BUILD_SPEC §6.7), shared by Record lookback? and Routine done.
 * Centred at (xPx, yPx) from the dialog's top-left, which is (wPx, hPx) big and centred on `card`.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { pxToCm } from "./Layout"
import { ColorToken, TextStyle, TextStyleName } from "./Theme"
import { addHover, childObject, makeSurface, makeText, themeColor } from "./Visuals"

const Z_ITEM = 0.1
const Z_LABEL = 0.05
const HIT_DEPTH = 1

export interface DialogButton {
  object: SceneObject
  rect: RoundedRectangle
  text: Text
  setLook(fill: ColorToken, ink: ColorToken): void
}

export interface DialogButtonSpec {
  label: string
  /** Centre, px from the dialog's top-left. */
  x: number
  y: number
  w: number
  h: number
  radius: number
  fill: ColorToken
  ink: ColorToken
  style: TextStyleName | TextStyle
  order: number
  /** Nudges the label down from the centre (px). */
  labelDy?: number
  onPress: () => void
}

export function makeDialogButton(card: SceneObject, dialogW: number, dialogH: number, spec: DialogButtonSpec): DialogButton {
  const object = childObject(spec.label, card)
  object.getTransform().setLocalPosition(new vec3(pxToCm(spec.x - dialogW / 2), -pxToCm(spec.y - dialogH / 2), Z_ITEM))
  const rect = makeSurface(object, { fill: spec.fill, radius: spec.radius }, spec.order, spec.w, spec.h)
  const label = childObject("Label", object)
  label.getTransform().setLocalPosition(new vec3(0, -pxToCm(spec.labelDy || 0), Z_LABEL))
  const text = makeText(label, spec.style, spec.ink, spec.order + 1)
  text.text = spec.label

  const collider = object.createComponent("ColliderComponent") as ColliderComponent
  collider.fitVisual = false
  const shape = Shape.createBoxShape()
  shape.size = new vec3(pxToCm(spec.w), pxToCm(spec.h), HIT_DEPTH)
  collider.shape = shape
  const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
  interactable.onTriggerEnd.add(spec.onPress)
  addHover(object, rect)
  return {
    object,
    rect,
    text,
    setLook(fill, ink) {
      rect.backgroundColor = themeColor(fill)
      text.textFill.color = themeColor(ink)
    },
  }
}
