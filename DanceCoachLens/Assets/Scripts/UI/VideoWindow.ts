/**
 * VideoWindow: the video panel with its count badge, lead-in dimming and status tag.
 *
 * A shallow view: it renders a ViewState and nothing else. Its fixed API is
 * setVideo(), setRect() (where it sits, in prototype pixels) and render() (what it shows).
 * Colours and sizes come from Theme.ts; position and size from Layout.ts.
 */
import { RoundedRectangle, TextureMode } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelCm, pxToCm, PxRect } from "./Layout"
import { RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, setRectSize, themeColor } from "./Visuals"

// Layers in front of the video, in cm, so nothing z-fights.
const Z_DIM = 0.1
const Z_BADGE = 0.2
// Rough width of a tag character, in ems, to size the tag around its label.
const TAG_CHAR_EM = 0.62
const TAG_PAD = 20

/** The status tag in the video's bottom-left corner, by screen. */
function tagLabel(view: ViewState): string | null {
  const sec = `SECTION ${view.section}`
  switch (view.screen) {
    case "BI":
      return `${sec} · STARTING POSE · controls locked`
    case "B0":
      return "LEAD-IN · controls locked"
    case "B":
      return `PLAYTHROUGH · ${sec} · controls locked`
    case "C":
    case "C2":
      return `${sec} DONE · controls unlocked`
    default:
      return null
  }
}

@component
export class VideoWindow extends BaseScriptComponent {
  private frame: RoundedRectangle
  private frameObject: SceneObject
  private dim: RoundedRectangle
  private dimObject: SceneObject
  private badgeObject: SceneObject
  private badgeText: Text
  private tag: RoundedRectangle
  private tagObject: SceneObject
  private tagText: Text
  private rect: { x: number; y: number; w: number; h: number } | null = null
  private lastBadge = ""
  private lastTag: string | null = ""

  onAwake() {
    this.frameObject = childObject("Video", this.sceneObject)
    this.frame = this.frameObject.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    this.frame.backgroundColor = themeColor("video")
    this.frame.initialize()

    this.dimObject = childObject("Dim", this.sceneObject)
    this.dim = makeRect(this.dimObject, "dim", 1)

    this.badgeObject = childObject("CountBadge", this.sceneObject)
    const badge = makeRect(this.badgeObject, "countBg", 1)
    setRectSize(badge, SPACING.countBadge, SPACING.countBadge, SPACING.countBadge / 2)
    const textObject = childObject("Count", this.badgeObject)
    textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    this.badgeText = makeText(textObject, TYPE.countBadge, "ink", 2)

    this.tagObject = childObject("Tag", this.sceneObject)
    this.tag = makeRect(this.tagObject, "chip", 1)
    const tagTextObject = childObject("TagText", this.tagObject)
    tagTextObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    this.tagText = makeText(tagTextObject, TYPE.tag, "ink", 2)
  }

  /** Shows a video texture in the window, cropped to fill its height. */
  setVideo(texture: Texture) {
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
    this.frame.textureMode = "Fill Height" as TextureMode
  }

  /** Places and sizes the window. The rect is in prototype pixels (Layout.SCREENS). */
  setRect(rect: PxRect) {
    const r = panelCm(rect)
    this.rect = r
    this.frameObject.getTransform().setLocalPosition(new vec3(r.x, r.y, 0))
    this.frame.size = new vec2(r.w, r.h)
    this.frame.cornerRadius = pxToCm(RADII.video)
    this.fitVideo()
    this.dimObject.getTransform().setLocalPosition(new vec3(r.x, r.y, Z_DIM))
    setRectSize(this.dim, rect[2], rect[3], RADII.video)
    // The badge sits in the top-left corner, inset from the edges.
    const d = pxToCm(SPACING.countBadge)
    const inset = pxToCm(SPACING.videoInset)
    this.badgeObject.getTransform().setLocalPosition(new vec3(r.x - r.w / 2 + inset + d / 2, r.y + r.h / 2 - inset - d / 2, Z_BADGE))
    this.lastTag = ""
  }

  render(view: ViewState) {
    const mirror = view.settings.mirror ? -1 : 1
    this.frameObject.getTransform().setLocalScale(new vec3(mirror, 1, 1))
    this.dimObject.enabled = view.video.dim

    // During a count-in the badge always shows the 5, 6, 7, 8; otherwise the count, if counts are on.
    const badge = view.countIn ? String(view.countIn.number) : view.settings.counts && view.count > 0 ? String(view.count) : ""
    this.badgeObject.enabled = badge !== ""
    if (badge !== this.lastBadge) {
      this.badgeText.text = badge
      this.lastBadge = badge
    }

    const tag = tagLabel(view)
    if (tag !== this.lastTag) {
      this.lastTag = tag
      this.renderTag(tag)
    }
  }

  private renderTag(label: string | null) {
    this.tagObject.enabled = !!label && !!this.rect
    if (!label || !this.rect) return
    const r = this.rect
    const wPx = label.length * TYPE.tag * TAG_CHAR_EM + TAG_PAD
    setRectSize(this.tag, wPx, SPACING.tagHeight, RADII.tag)
    this.tagText.text = label
    const inset = pxToCm(SPACING.videoInset)
    const w = pxToCm(wPx)
    const h = pxToCm(SPACING.tagHeight)
    this.tagObject.getTransform().setLocalPosition(new vec3(r.x - r.w / 2 + inset + w / 2, r.y - r.h / 2 + inset + h / 2, Z_BADGE))
  }
}
