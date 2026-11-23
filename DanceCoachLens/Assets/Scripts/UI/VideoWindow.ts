/**
 * VideoWindow: the video panel and everything on it (BUILD_SPEC §6.1–6.4): the 4 px outline,
 * the count ring top-right, the settings pills top-left and the lock bottom-left, plus its dimming
 * (lightly during a lead-in, more behind a pop-up).
 *
 * A shallow view: what shows is decided by overlayFor() in Core/Overlay.ts; this only draws it.
 * Its fixed API is setVideo(), setRect() (where it sits, in prototype pixels) and render() (what it shows).
 * Colours and sizes come from Theme.ts; position and size from Layout.ts.
 */
import { RoundedRectangle, TextureMode } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { LookbackView } from "../Core/LookbackController"
import { OverlayPill, overlayFor, RingView } from "../Core/Overlay"
import { PoseView } from "../Core/PoseController"
import { panelCm, pxToCm, PxRect } from "./Layout"
import { RADIUS, SIZE, SPACE } from "./Theme"
import { childObject, makeIcon, makeOutline, makePill, makeRect, makeText, setRectSize, setSurfaceBorder, themeColor } from "./Visuals"

// Layers in front of the video, in cm, so nothing z-fights.
const Z_DIM = 0.1
const Z_OUTLINE = 0.15
const Z_OVERLAY = 0.2
// Rough width of a pill character, in ems, to size the pill around its label (Sora 700, mostly capitals).
const PILL_CHAR_EM = 0.7
const PILL_PAD = 16
// The ring's fill is 8 arcs (one per count), each drawn as this many short rects laid along the arc.
const RING_COUNTS = 8
const ARC_PIECES = 6
const ARC_OVERLAP_PX = 1
const LOCK_ICON_PX = 12
// Most pills at once: the speed and MIRRORED.
const MAX_PILLS = 2

interface Pill {
  object: SceneObject
  rect: RoundedRectangle
  text: Text
}

@component
export class VideoWindow extends BaseScriptComponent {
  /** Side by side's second window, the take: pink where the original's outline and ring are lime. Set before the first render. */
  isTake = false

  private frame: RoundedRectangle
  private frameObject: SceneObject
  private dim: RoundedRectangle
  private dimObject: SceneObject
  private outline: RoundedRectangle
  private outlineObject: SceneObject
  private ringObject: SceneObject
  private ringText: Text
  private ringPieces: { rect: RoundedRectangle; count: number }[] = []
  private pills: Pill[] = []
  private lockObject: SceneObject
  private rect: { x: number; y: number; w: number; h: number } | null = null
  private rectPx: PxRect | null = null
  private lastOutline = ""
  private lastRing = "-"
  private lastPills = "-"
  private scrim = false
  private fitPending = false
  // The clip on show, and the still that stands in for it in Pose (null in Playthrough).
  private video: Texture | null = null
  private still: Texture | null = null

  onAwake() {
    this.frameObject = childObject("Video", this.sceneObject)
    this.frame = this.frameObject.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    this.frame.backgroundColor = themeColor("video")
    this.frame.initialize()
    // Mirroring flips the video with a negative X scale, which shows its back face.
    this.frame.renderMeshVisual.mainPass.twoSided = true

    this.dimObject = childObject("Dim", this.sceneObject)
    this.dim = makeRect(this.dimObject, "dim", 1)

    this.outlineObject = childObject("Outline", this.sceneObject)
    this.outline = makeOutline(this.outlineObject, "control", 3, 1, 1)

    this.buildRing()

    for (let i = 0; i < MAX_PILLS; i++) {
      const object = childObject(`Pill${i}`, this.sceneObject)
      const rect = makePill(object, "scrim", 3, SIZE.chip, SIZE.chip)
      const textObject = childObject("PillText", object)
      textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
      this.pills.push({ object, rect, text: makeText(textObject, "chip", "text", 4) })
    }

    this.lockObject = childObject("Lock", this.sceneObject)
    makePill(this.lockObject, "scrim", 3, SIZE.chip, SIZE.chip)
    const padlock = makeIcon(this.lockObject, "padlock", "text", 4, LOCK_ICON_PX)
    padlock.object.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
  }

  /**
   * The count ring (§6.2): a 96 circle, 8 thick, with an 80 dark centre and the count in it. The fill is eight arcs,
   * one per count, each a run of short rects along the arc, switched on a count at a time: no easing.
   */
  private buildRing() {
    this.ringObject = childObject("CountRing", this.sceneObject)
    const track = childObject("Track", this.ringObject)
    makePill(track, null, 3, SIZE.ring, SIZE.ring, "control", SIZE.ringStroke)
    const centre = childObject("Centre", this.ringObject)
    makePill(centre, "track", 3, SIZE.ringCentre, SIZE.ringCentre)
    centre.getTransform().setLocalPosition(new vec3(0, 0, 0.01))

    const mid = (SIZE.ring - SIZE.ringStroke) / 2
    const degPerPiece = 360 / RING_COUNTS / ARC_PIECES
    const chord = 2 * mid * Math.tan((degPerPiece / 2) * (Math.PI / 180)) + ARC_OVERLAP_PX
    for (let count = 1; count <= RING_COUNTS; count++) {
      for (let j = 0; j < ARC_PIECES; j++) {
        // Clockwise from 12 o'clock.
        const phi = (((count - 1) * ARC_PIECES + j + 0.5) * degPerPiece * Math.PI) / 180
        const object = childObject(`Arc${count}_${j}`, this.ringObject)
        const rect = makeRect(object, "volt", 4)
        setRectSize(rect, chord, SIZE.ringStroke, 0)
        object.getTransform().setLocalPosition(new vec3(pxToCm(mid * Math.sin(phi)), pxToCm(mid * Math.cos(phi)), 0.02))
        object.getTransform().setLocalRotation(quat.angleAxis(-phi, vec3.forward()))
        this.ringPieces.push({ rect, count })
      }
    }

    const textObject = childObject("Count", this.ringObject)
    textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    this.ringText = makeText(textObject, "countXl", "text", 5)
  }

  /** Shows a video texture in the window, cropped to fill its height. */
  setVideo(texture: Texture) {
    this.video = texture
    if (!this.still) this.show(texture)
  }

  /** Shows a still in place of the video (Pose), or the video again for null. */
  setStill(texture: Texture | null) {
    if (texture === this.still) return
    this.still = texture
    const shown = texture ?? this.video
    if (shown) this.show(shown)
  }

  private show(texture: Texture) {
    this.frame.useTexture = true
    this.frame.texture = texture
    this.fitVideo()
  }

  /**
   * Re-fits the video to the window. UI Kit only works out the fit when textureMode is set,
   * from the size at that moment, so call this after the size changes and once the video is
   * ready (a video's aspect isn't known before then).
   */
  fitVideo() {
    if (!this.frame.texture) return
    // A clip that hasn't prepared yet reports an aspect of NaN, which would blank the window;
    // keep the last fit (every clip has the same aspect) and fit again once it's known.
    const texture = this.frame.texture
    const aspect = this.still ? texture.getWidth() / texture.getHeight() : (texture.control as VideoTextureProvider).getAspect()
    this.fitPending = !(aspect > 0)
    if (this.fitPending) return
    this.frame.textureMode = "Fill Height" as TextureMode
  }

  /** The middle of the video's left, right, top and bottom edges in world space, wherever the window is; null before setRect(). */
  worldEdges(): { left: vec3; right: vec3; top: vec3; bottom: vec3 } | null {
    const r = this.rect
    if (!r) return null
    const m = this.sceneObject.getTransform().getWorldTransform()
    const at = (x: number, y: number) => m.multiplyPoint(new vec3(x, y, 0))
    return { left: at(r.x - r.w / 2, r.y), right: at(r.x + r.w / 2, r.y), top: at(r.x, r.y + r.h / 2), bottom: at(r.x, r.y - r.h / 2) }
  }

  /** Places and sizes the window. The rect is in prototype pixels (Layout.SCREENS). */
  setRect(rect: PxRect) {
    const r = panelCm(rect)
    this.rect = r
    this.rectPx = rect
    this.frameObject.getTransform().setLocalPosition(new vec3(r.x, r.y, 0))
    this.frame.size = new vec2(r.w, r.h)
    this.frame.cornerRadius = pxToCm(RADIUS.xl)
    this.fitVideo()
    this.dimObject.getTransform().setLocalPosition(new vec3(r.x, r.y, Z_DIM))
    setRectSize(this.dim, rect[2], rect[3], RADIUS.xl)
    this.outlineObject.getTransform().setLocalPosition(new vec3(r.x, r.y, Z_OUTLINE))
    setRectSize(this.outline, rect[2], rect[3], RADIUS.xl)

    // The ring top-right, the pills top-left (in renderPills), the lock bottom-left: each 20 in from the edges.
    const inset = pxToCm(SPACE.videoInset)
    const ring = pxToCm(SIZE.ring)
    this.ringObject.getTransform().setLocalPosition(new vec3(r.x + r.w / 2 - inset - ring / 2, r.y + r.h / 2 - inset - ring / 2, Z_OVERLAY))
    const lock = pxToCm(SIZE.chip)
    this.lockObject.getTransform().setLocalPosition(new vec3(r.x - r.w / 2 + inset + lock / 2, r.y - r.h / 2 + inset + lock / 2, Z_OVERLAY))
    this.lastPills = "-"
  }

  render(view: ViewState, pose: PoseView | null = null, look: LookbackView | null = null) {
    if (this.fitPending) this.fitVideo()
    const mirror = view.settings.mirror ? -1 : 1
    this.frameObject.getTransform().setLocalScale(new vec3(mirror, 1, 1))
    this.dimObject.enabled = view.video.dim
    const scrim = view.popup !== null || view.screen === "J"
    if (scrim !== this.scrim) {
      this.scrim = scrim
      this.dim.backgroundColor = themeColor(scrim ? "scrim" : "dim")
    }

    const overlay = overlayFor(view, pose, look, this.isTake)
    if (overlay.outline !== this.lastOutline) {
      this.lastOutline = overlay.outline
      setSurfaceBorder(this.outline, overlay.outline, SIZE.outline)
    }
    this.lockObject.enabled = overlay.lock
    this.renderRing(overlay.ring)
    const pills = overlay.pills.map((p) => `${p.tone}:${p.label}`).join("|")
    if (pills !== this.lastPills) {
      this.lastPills = pills
      this.renderPills(overlay.pills)
    }
  }

  /** The ring steps one-eighth per count, with no easing: the arcs up to the count are on, the rest off. */
  private renderRing(ring: RingView | null) {
    this.ringObject.enabled = !!ring
    if (!ring) {
      this.lastRing = "-"
      return
    }
    const key = `${ring.color}:${ring.count}:${ring.label}`
    if (key === this.lastRing) return
    this.lastRing = key
    const color = themeColor(ring.color)
    for (const piece of this.ringPieces) {
      piece.rect.backgroundColor = color
      piece.rect.enabled = piece.count <= ring.count
    }
    this.ringText.text = ring.label
  }

  /** Lines the pills up from the top-left corner, 20 in from the edges, 8 apart. */
  private renderPills(labels: OverlayPill[]) {
    if (!this.rect) return
    let left = this.rect.x - this.rect.w / 2 + pxToCm(SPACE.videoInset)
    const top = this.rect.y + this.rect.h / 2 - pxToCm(SPACE.videoInset)
    this.pills.forEach((pill, i) => {
      const spec = labels[i]
      pill.object.enabled = !!spec
      if (!spec) return
      const wPx = spec.label.length * 14 * PILL_CHAR_EM + PILL_PAD * 2
      setRectSize(pill.rect, wPx, SIZE.chip, RADIUS.pill)
      pill.rect.backgroundColor = themeColor(spec.tone === "pink" ? "pink" : "scrim")
      pill.text.text = spec.label
      pill.text.textFill.color = themeColor(spec.tone === "pink" ? "onColor" : "text")
      const w = pxToCm(wPx)
      pill.object.getTransform().setLocalPosition(new vec3(left + w / 2, top - pxToCm(SIZE.chip) / 2, Z_OVERLAY))
      left += w + pxToCm(SPACE.group)
    })
  }
}
