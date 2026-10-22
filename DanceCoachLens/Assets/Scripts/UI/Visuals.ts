/**
 * Visuals: small builders the view components share, so each one only says what it shows.
 * Everything is sized in prototype pixels and coloured by Theme tokens.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
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

/** What a run is called on its labels: FULL ROUTINE, or the section it starts with. */
export function runLabel(view: ViewState): string {
  return view.runKind === "full" ? "FULL ROUTINE" : `SECTION ${view.runKind === "top" ? 1 : view.section}`
}

/** True for runs that play several sections (From the top and Full). */
export const isMultiSection = (view: ViewState) => view.runKind !== "section"

/**
 * The From the top icon, |→, centred on the object's position: a bar for the top,
 * then an arrow. Drawn from rectangles so it doesn't depend on the font.
 */
export function makeTopIcon(so: SceneObject, token: ColorToken, renderOrder: number, widthPx: number) {
  const part = (name: string, x: number, y: number, w: number, h: number, angleDeg = 0) => {
    const o = childObject(name, so)
    setRectSize(makeRect(o, token, renderOrder), w, h, 1)
    o.getTransform().setLocalPosition(new vec3(pxToCm(x), pxToCm(y), 0))
    if (angleDeg) o.getTransform().setLocalRotation(quat.angleAxis((angleDeg * Math.PI) / 180, vec3.forward()))
  }
  // As in the prototype: 12 px tall, a bar, a shaft and a two-stroke head.
  const half = widthPx / 2
  part("Bar", -half, 0, 2, 12)
  part("Shaft", 0, 0, widthPx, 2)
  part("HeadUp", half - 3, 2.5, 8, 2, -45)
  part("HeadDown", half - 3, -2.5, 8, 2, 45)
}

/** Moves an object on the window plane (centimetres), z in front of the video. */
export function place(so: SceneObject, xy: vec2, z: number) {
  so.getTransform().setLocalPosition(new vec3(xy.x, xy.y, z))
}
