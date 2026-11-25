/**
 * Visuals: small builders the view components share, so each one only says what it shows.
 * Everything is sized in prototype pixels and coloured by Theme tokens.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { pxToCm } from "./Layout"
import { COLORS, ColorToken, fontFile, RADIUS, rgba, SIZE, TEXT, TextStyle, TextStyleName } from "./Theme"

// Text em-square height in cm = size / this (Lens Studio 5.16+, as in UI Kit's TextStylePresets).
const TEXT_SIZE_PER_CM = 43.88571429

// Text.letterSpacing for 1 em of tracking. Only the eyebrow is tracked (0.14 em). Was 10, which spread "SECTION n IN" far wider than B2; check on device.
const LETTER_SPACING_PER_EM = 1

// The B2 fonts in Assets/Fonts (the "-tab" cuts have tabular digits, for counts). requireAsset needs literal paths.
const FONTS: Record<string, () => Asset> = {
  "Sora-600.ttf": () => requireAsset("../../Fonts/Sora-600.ttf"),
  "Sora-700.ttf": () => requireAsset("../../Fonts/Sora-700.ttf"),
  "Sora-800.ttf": () => requireAsset("../../Fonts/Sora-800.ttf"),
  "Sora-600-tab.ttf": () => requireAsset("../../Fonts/Sora-600-tab.ttf"),
  "Sora-700-tab.ttf": () => requireAsset("../../Fonts/Sora-700-tab.ttf"),
  "Sora-800-tab.ttf": () => requireAsset("../../Fonts/Sora-800-tab.ttf"),
  "Inter-400.ttf": () => requireAsset("../../Fonts/Inter-400.ttf"),
  "Inter-500.ttf": () => requireAsset("../../Fonts/Inter-500.ttf"),
  "Inter-600.ttf": () => requireAsset("../../Fonts/Inter-600.ttf"),
  "Inter-700.ttf": () => requireAsset("../../Fonts/Inter-700.ttf"),
  "Inter-400-tab.ttf": () => requireAsset("../../Fonts/Inter-400-tab.ttf"),
  "Inter-500-tab.ttf": () => requireAsset("../../Fonts/Inter-500-tab.ttf"),
  "Inter-600-tab.ttf": () => requireAsset("../../Fonts/Inter-600-tab.ttf"),
  "Inter-700-tab.ttf": () => requireAsset("../../Fonts/Inter-700-tab.ttf"),
}
const loadedFonts: Record<string, Font | null> = {}

/** The font asset for a text style, loaded once; null (the default font) if it's missing. */
function fontAsset(style: TextStyle): Font | null {
  const file = fontFile(style)
  if (!(file in loadedFonts)) {
    try {
      loadedFonts[file] = FONTS[file]() as Font
    } catch (e) {
      print(`Font ${file} is missing: ${e}`)
      loadedFonts[file] = null
    }
  }
  return loadedFonts[file]
}

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
 * for "left", the right for "right", the middle for "center", vertically centred either way.
 * The text lives on a child of so: a ScreenTransform ignores its own object's local
 * position, so so stays a plain object that can be moved.
 */
export function makeText(
  so: SceneObject,
  style: TextStyleName | TextStyle | number,
  token: ColorToken,
  renderOrder: number,
  align: "left" | "center" | "right" = "center",
): Text {
  const textObject = childObject("Text", so)
  const st = textObject.createComponent("Component.ScreenTransform") as ScreenTransform
  // A zero-size box, so the alignment is relative to the object's position.
  st.anchors = Rect.create(0, 0, 0, 0)
  st.offsets = Rect.create(0, 0, 0, 0)
  const text = textObject.createComponent("Component.Text") as Text
  // A bare number is a wireframe size in the default font, until every view moves to a text style (#53).
  const s: TextStyle | null = typeof style === "number" ? null : typeof style === "string" ? TEXT[style] : style
  text.size = pxToCm(s ? s.size : (style as number)) * TEXT_SIZE_PER_CM
  if (s) {
    const font = fontAsset(s)
    if (font) text.font = font
    if (s.letterSpacing) text.letterSpacing = s.letterSpacing * LETTER_SPACING_PER_EM
  }
  text.textFill.color = themeColor(token)
  text.horizontalAlignment = align === "left" ? HorizontalAlignment.Left : align === "right" ? HorizontalAlignment.Right : HorizontalAlignment.Center
  text.verticalAlignment = VerticalAlignment.Center
  text.horizontalOverflow = HorizontalOverflow.Overflow
  text.verticalOverflow = VerticalOverflow.Overflow
  text.renderOrder = renderOrder
  return text
}

/** What a run is called on its labels: FULL ROUTINE, or the section it starts with. */
export function runLabel(view: ViewState): string {
  if (view.runKind === "full") return "FULL ROUTINE"
  if (view.runKind === "section" && view.runStop > view.section) return `SECTIONS ${view.section}–${view.runStop}`
  return `SECTION ${view.runKind === "top" ? 1 : view.section}`
}

/** True for runs that play several sections (From the top, Full and a range). */
export const isMultiSection = (view: ViewState) => view.runKind !== "section" || view.runStop > view.section

/** Moves an object on the window plane (centimetres), z in front of the video. */
export function place(so: SceneObject, xy: vec2, z: number) {
  so.getTransform().setLocalPosition(new vec3(xy.x, xy.y, z))
}

// ---- B2 builders (BUILD_SPEC §6). Sizes in prototype px; every colour is a Theme token. ----

/** A rounded surface: a fill, an optional inset border, a corner radius. The building block of every B2 panel and button. */
export interface SurfaceStyle {
  fill: ColorToken | null
  border?: ColorToken
  borderPx?: number
  radius: number
}

const CLEAR = new vec4(0, 0, 0, 0)

/** A surface sized wPx × hPx, centred on the object. A null fill leaves only the border. */
export function makeSurface(so: SceneObject, style: SurfaceStyle, renderOrder: number, wPx: number, hPx: number): RoundedRectangle {
  const rect = makeRect(so, style.fill || "control", renderOrder)
  if (!style.fill) rect.backgroundColor = CLEAR
  setSurfaceBorder(rect, style.border || null, style.borderPx || 1)
  setRectSize(rect, wPx, hPx, style.radius)
  return rect
}

/** Sets or clears a surface's inset border. */
export function setSurfaceBorder(rect: RoundedRectangle, token: ColorToken | null, px = 1) {
  rect.border = !!token
  if (token) {
    rect.borderSize = pxToCm(px)
    rect.borderColor = themeColor(token)
  }
}

/** A pill (radius 999): buttons, segments, tiles, chips. An optional 1–2 px border. */
export function makePill(so: SceneObject, fill: ColorToken | null, renderOrder: number, wPx: number, hPx: number, border?: ColorToken, borderPx = 1): RoundedRectangle {
  return makeSurface(so, { fill, border, borderPx, radius: RADIUS.pill }, renderOrder, wPx, hPx)
}

/**
 * A 1 px dashed outline wPx × hPx, centred on the object (the section bar's "beyond the stop" segments): 3 px dashes
 * 3 apart along the top and bottom between the rounded ends, and a short upright at each end. Built from rectangles,
 * so build it once and toggle it.
 */
export function makeDashedOutline(so: SceneObject, token: ColorToken, renderOrder: number, wPx: number, hPx: number, dashPx = 3): SceneObject {
  const line = 1
  const r = hPx / 2
  const part = (x: number, y: number, w: number, h: number) => {
    const o = childObject("Dash", so)
    setRectSize(makeRect(o, token, renderOrder), w, h)
    o.getTransform().setLocalPosition(new vec3(pxToCm(x), pxToCm(y), 0))
  }
  const run = wPx - 2 * r
  for (let x = 0; x < run; x += dashPx * 2) {
    const w = Math.min(dashPx, run - x)
    const cx = -wPx / 2 + r + x + w / 2
    part(cx, hPx / 2 - line / 2, w, line)
    part(cx, -hPx / 2 + line / 2, w, line)
  }
  for (const side of [-1, 1]) part(side * (wPx / 2 - line / 2), 0, line, hPx / 2)
  return so
}

/** The video window's outline: 4 px, radius 32, no fill. Volt while a clip plays, pink in Lookback, control otherwise. */
export function makeOutline(so: SceneObject, token: ColorToken, renderOrder: number, wPx: number, hPx: number): RoundedRectangle {
  return makeSurface(so, { fill: null, border: token, borderPx: SIZE.outline, radius: RADIUS.xl }, renderOrder, wPx, hPx)
}

export type IconName = "padlock" | "mirror" | "counts" | "play" | "pause" | "back" | "forward" | "plus" | "replay" | "check"

/** An icon: its object (centred on its parent's origin) and a way to recolour it. */
export interface Icon {
  object: SceneObject
  setColor(token: ColorToken): void
}

/**
 * An icon drawn from rectangles, so it doesn't depend on a font: the padlock, the mirror (a line between two
 * mirrored triangles), Counts (a circled 8), play, ‹, ›, +, replay (↺) and a tick (✓). sizePx is its box (20–24 in buttons, 12 for the lock).
 */
export function makeIcon(so: SceneObject, name: IconName, token: ColorToken, renderOrder: number, sizePx: number = SIZE.icon): Icon {
  const object = childObject(`Icon_${name}`, so)
  const rects: RoundedRectangle[] = []
  const texts: Text[] = []
  // Parts are laid out on a 24-unit box, y up, scaled to sizePx.
  const k = sizePx / 24
  const part = (x: number, y: number, w: number, h: number, radius: number, angleDeg = 0) => {
    const o = childObject("Part", object)
    const rect = makeRect(o, token, renderOrder)
    setRectSize(rect, w * k, h * k, radius * k)
    o.getTransform().setLocalPosition(new vec3(pxToCm(x * k), pxToCm(y * k), 0))
    if (angleDeg) o.getTransform().setLocalRotation(quat.angleAxis((angleDeg * Math.PI) / 180, vec3.forward()))
    rects.push(rect)
    return rect
  }
  /** A stroke from (x1, y1) to (x2, y2) with round caps. */
  const line = (x1: number, y1: number, x2: number, y2: number, width = 2) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy) + width
    part((x1 + x2) / 2, (y1 + y2) / 2, len, width, width / 2, (Math.atan2(dy, dx) * 180) / Math.PI)
  }
  /** A filled triangle pointing right (dir 1) or left (-1), from horizontal slices. */
  const triangle = (cx: number, cy: number, w: number, h: number, dir: 1 | -1) => {
    const slices = 12
    const base = cx - (dir * w) / 2
    for (let i = 0; i < slices; i++) {
      const y = cy + h / 2 - ((i + 0.5) * h) / slices
      const sw = w * (1 - Math.abs(y - cy) / (h / 2))
      // A little overlap between slices so no seam shows.
      part(base + (dir * sw) / 2, y, sw, h / slices + 0.4, 0)
    }
  }
  /** An outlined circle (a ring) of the given diameter. */
  const ring = (cx: number, cy: number, d: number, width = 2) => {
    const rect = part(cx, cy, d, d, d / 2)
    rect.backgroundColor = CLEAR
    rect.border = true
    rect.borderSize = pxToCm(width * k)
    rect.borderColor = themeColor(token)
  }

  switch (name) {
    case "padlock": {
      // The shackle: a ring whose lower half the body covers.
      ring(0, 3, 12, 2.5)
      part(0, -4, 18, 13, 2.5)
      break
    }
    case "mirror": {
      line(0, -10, 0, 10)
      // Two triangle outlines, mirrored across the line.
      for (const side of [-1, 1]) {
        const near = side * 4
        const far = side * 11
        line(near, 7, near, -7)
        line(near, 7, far, 0)
        line(near, -7, far, 0)
      }
      break
    }
    case "counts": {
      ring(0, 0, 22)
      const o = childObject("Eight", object)
      o.getTransform().setLocalPosition(new vec3(0, 0, 0.01))
      const t = makeText(o, { ...TEXT.chip, size: 13 * k, tabular: true }, token, renderOrder + 1)
      t.text = "8"
      texts.push(t)
      break
    }
    case "play":
      triangle(1.5, 0, 15, 18, 1)
      break
    case "pause":
      part(-4.5, 0, 5, 17, 1)
      part(4.5, 0, 5, 17, 1)
      break
    case "back":
    case "forward": {
      const d = name === "back" ? -1 : 1
      line(-d * 3, 7, d * 4, 0, 2.5)
      line(d * 4, 0, -d * 3, -7, 2.5)
      break
    }
    case "plus":
      part(0, 0, 18, 2.5, 1.25)
      part(0, 0, 2.5, 18, 1.25)
      break
    case "check":
      // ✓ (neither Sora nor Inter has the glyph).
      line(-8, 1, -3, -5, 2.5)
      line(-3, -5, 8, 6, 2.5)
      break
    case "replay": {
      // ↺: an open circle from short strokes, starting top-left and going round anticlockwise, with a head at the start.
      const r = 8
      const from = 120
      const sweep = 290
      const steps = 14
      const at = (deg: number) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)]
      for (let i = 0; i < steps; i++) {
        const [x1, y1] = at(from + (sweep * i) / steps)
        const [x2, y2] = at(from + (sweep * (i + 1)) / steps)
        line(x1, y1, x2, y2, 2)
      }
      const [hx, hy] = at(from)
      line(hx, hy, hx - 5, hy, 2)
      line(hx, hy, hx, hy + 5, 2)
      break
    }
  }

  return {
    object,
    setColor(next: ColorToken) {
      rects.forEach((r) => {
        if (r.border && r.backgroundColor.w === 0) r.borderColor = themeColor(next)
        else r.backgroundColor = themeColor(next)
      })
      texts.forEach((t) => (t.textFill.color = themeColor(next)))
    },
  }
}

// A button's hover tint: white over dark fills, black over light ones.
const HOVER_LIGHT = new vec4(1, 1, 1, 0.16)
const HOVER_DARK = new vec4(0, 0, 0, 0.14)

/** Where a hover tint goes when the button has no single surface to copy: its size and corner radius in px, and render order. */
export interface HoverBox {
  wPx: number
  hPx: number
  radiusPx: number
  order: number
  /** The white tint's opacity; the default suits a button, a big surface wants less. */
  alpha?: number
}

/**
 * Tints a button while it's hovered. Call it after the button's Interactable exists. The tint copies the button's
 * surface when it's hovered (so a size or colour set later is picked up), or uses a fixed box where there's no surface.
 * It sits on its own object, so it doesn't fight whatever colour the button's state sets.
 */
export function addHover(button: SceneObject, source: RoundedRectangle | HoverBox) {
  const interactable = button.getComponent(Interactable.getTypeName()) as Interactable
  if (!interactable) return
  const holder = childObject("Hover", button)
  holder.getTransform().setLocalPosition(new vec3(0, 0, 0.02))
  const tintObject = childObject("Tint", holder)
  const isBox = "wPx" in source
  const tint = makeRect(tintObject, "text", isBox ? source.order : (source as RoundedRectangle).renderOrder + 2)
  tintObject.enabled = false

  interactable.onHoverEnter.add(() => {
    if (isBox) {
      const box = source as HoverBox
      setRectSize(tint, box.wPx, box.hPx, box.radiusPx)
      tint.backgroundColor = box.alpha === undefined ? HOVER_LIGHT : new vec4(1, 1, 1, box.alpha)
    } else {
      const rect = source as RoundedRectangle
      tint.size = rect.size
      tint.cornerRadius = rect.cornerRadius
      const c = rect.backgroundColor
      const light = c.w > 0.5 && 0.299 * c.x + 0.587 * c.y + 0.114 * c.z > 0.7
      tint.backgroundColor = light ? HOVER_DARK : HOVER_LIGHT
    }
    tintObject.enabled = true
  })
  interactable.onHoverExit.add(() => (tintObject.enabled = false))
  // A hidden button sends no hover-exit.
  const script = holder.createComponent("Component.ScriptComponent") as ScriptComponent
  script.createEvent("OnDisableEvent").bind(() => (tintObject.enabled = false))
}

/** An icon button: a 56 circle (control fill, white icon); on = white fill with a dark icon (BUILD_SPEC §6.9, option A). */
export interface IconButton {
  object: SceneObject
  rect: RoundedRectangle
  icon: Icon
  setOn(on: boolean): void
}

export function makeIconButton(so: SceneObject, icon: IconName, renderOrder: number, sizePx: number = SIZE.control): IconButton {
  const rect = makePill(so, "control", renderOrder, sizePx, sizePx)
  const glyph = makeIcon(so, icon, "text", renderOrder + 1)
  glyph.object.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
  return {
    object: so,
    rect,
    icon: glyph,
    setOn(on: boolean) {
      rect.backgroundColor = themeColor(on ? "text" : "control")
      glyph.setColor(on ? "onColor" : "text")
    },
  }
}

/**
 * Fades a group of objects (BUILD_SPEC §6.8a): every rounded rectangle's fill and border and every text's colour
 * under the roots, at `opacity` times its own alpha. Scaling or a material fade would need every builder to opt in;
 * this works on whatever the group holds. A colour changed while the group is faded (a toggle, a rebuilt row) is
 * taken as the new full colour. finish() puts every colour back at full and forgets them.
 */
export class GroupFade {
  private rects = new Map<RoundedRectangle, { fill: vec4; fillSet: vec4; border: vec4; borderSet: vec4 }>()
  private texts = new Map<Text, { color: vec4; set: vec4 }>()

  constructor(private roots: SceneObject[]) {}

  apply(opacity: number) {
    for (const root of this.roots) this.walk(root, opacity)
  }

  finish() {
    this.apply(1)
    this.rects.clear()
    this.texts.clear()
  }

  private walk(so: SceneObject, a: number) {
    for (const rect of so.getComponents(RoundedRectangle.getTypeName()) as RoundedRectangle[]) {
      let s = this.rects.get(rect)
      if (!s) {
        s = { fill: rect.backgroundColor, fillSet: rect.backgroundColor, border: rect.borderColor, borderSet: rect.borderColor }
        this.rects.set(rect, s)
      }
      if (!sameColor(rect.backgroundColor, s.fillSet)) s.fill = rect.backgroundColor
      if (!sameColor(rect.borderColor, s.borderSet)) s.border = rect.borderColor
      s.fillSet = withAlpha(s.fill, a)
      s.borderSet = withAlpha(s.border, a)
      rect.backgroundColor = s.fillSet
      if (rect.border) rect.borderColor = s.borderSet
    }
    for (const text of so.getComponents("Component.Text") as Text[]) {
      let s = this.texts.get(text)
      if (!s) {
        s = { color: text.textFill.color, set: text.textFill.color }
        this.texts.set(text, s)
      }
      if (!sameColor(text.textFill.color, s.set)) s.color = text.textFill.color
      s.set = withAlpha(s.color, a)
      text.textFill.color = s.set
    }
    for (let i = 0; i < so.getChildrenCount(); i++) this.walk(so.getChild(i), a)
  }
}

const withAlpha = (c: vec4, a: number) => new vec4(c.x, c.y, c.z, c.w * a)
const sameColor = (a: vec4, b: vec4) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) + Math.abs(a.w - b.w) < 1e-4

/** Mixes two colours, k from 0 (a) to 1 (b). */
export const mixColor = (a: vec4, b: vec4, k: number) => new vec4(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, a.w + (b.w - a.w) * k)
