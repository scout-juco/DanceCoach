/**
 * Visuals: small builders the view components share, so each one only says what it shows.
 * Everything is sized in prototype pixels and coloured by Theme tokens.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { pxToCm } from "./Layout"
import { COLORS, ColorToken, rgba } from "./Theme"

// Text em-square height in cm = size / this (Lens Studio 5.16+, as in UI Kit's TextStylePresets).
const TEXT_SIZE_PER_CM = 43.88571429

export const themeColor = (token: ColorToken) => {
  const [r, g, b, a] = rgba(COLORS[token])
  return new vec4(r, g, b, a)
}

/** A new child scene object on the parent's layer. */
export function childObject(name: string, parent: SceneObject): SceneObject {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  so.layer = parent.layer
  return so
}

/** A flat rounded rectangle; size it with setRectSize(). */
export function makeRect(so: SceneObject, token: ColorToken, renderOrder: number): RoundedRectangle {
  const rect = so.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
  rect.backgroundColor = themeColor(token)
  rect.renderOrder = renderOrder
  rect.initialize()
  rect.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
  return rect
}

/** Sizes a rectangle in prototype pixels, with a corner radius (in px too). */
export function setRectSize(rect: RoundedRectangle, wPx: number, hPx: number, radiusPx = 0) {
  rect.size = new vec2(pxToCm(wPx), pxToCm(hPx))
  rect.cornerRadius = pxToCm(Math.min(radiusPx, wPx / 2, hPx / 2))
}

/**
 * A line of text whose anchor point is its scene object's position: the left edge
 * for "left", the middle for "center", vertically centred either way.
 */
export function makeText(so: SceneObject, sizePx: number, token: ColorToken, renderOrder: number, align: "left" | "center" = "center"): Text {
  const st = so.createComponent("Component.ScreenTransform") as ScreenTransform
  // A zero-size box, so the alignment is relative to the object's position.
  st.anchors = Rect.create(0, 0, 0, 0)
  st.offsets = Rect.create(0, 0, 0, 0)
  const text = so.createComponent("Component.Text") as Text
  text.size = pxToCm(sizePx) * TEXT_SIZE_PER_CM
  text.textFill.color = themeColor(token)
  text.horizontalAlignment = align === "left" ? HorizontalAlignment.Left : HorizontalAlignment.Center
  text.verticalAlignment = VerticalAlignment.Center
  text.horizontalOverflow = HorizontalOverflow.Overflow
  text.verticalOverflow = VerticalOverflow.Overflow
  text.renderOrder = renderOrder
  return text
}

/** Moves an object on the window plane (centimetres), z in front of the video. */
export function place(so: SceneObject, xy: vec2, z: number) {
  so.getTransform().setLocalPosition(new vec3(xy.x, xy.y, z))
}
