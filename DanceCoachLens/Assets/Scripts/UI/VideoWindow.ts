/**
 * VideoWindow: the video panel with its count badge, chips, lead-in dimming and status tag.
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
const CHIP_PAD = 16

/** The chips in the video's top-right corner, left to right: the speed during a run, and MIRRORED. */
function chipLabels(view: ViewState): string[] {
  const running = view.screen === "BI" || view.screen === "B0" || view.screen === "B"
  const chips: string[] = []
  if (running || view.screen === "F") chips.push(`${view.settings.speed}×`)
  if (running && view.settings.mirror) chips.push("MIRRORED")
  return chips
}

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
  private chips: { object: SceneObject; rect: RoundedRectangle; text: Text }[] = []
  private rect: { x: number; y: number; w: number; h: number } | null = null
  private lastBadge = ""
  private lastTag: string | null = ""
  private lastChips = "-"

  onAwake() {
    this.frameObject = childObject("Video", this.sceneObject)
    this.frame = this.frameObject.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    this.frame.backgroundColor = themeColor("video")
    this.frame.initialize()
    // Mirroring flips the video with a negative X scale, which shows its back face.
    this.frame.renderMeshVisual.mainPass.twoSided = true

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

    for (let i = 0; i < 2; i++) {
      const object = childObject(`Chip${i}`, this.sceneObject)
      const rect = makeRect(object, "chip", 1)
      const textObject = childObject("ChipText", object)
      textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
      this.chips.push({ object, rect, text: makeText(textObject, TYPE.chip, "ink", 2) })
    }
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
    this.lastChips = "-"
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

    const chips = chipLabels(view)
    if (chips.join("|") !== this.lastChips) {
      this.lastChips = chips.join("|")
      this.renderChips(chips)
    }

    const tag = tagLabel(view)
    if (tag !== this.lastTag) {
      this.lastTag = tag
      this.renderTag(tag)
    }
  }

  /** Lines the chips up from the top-right corner, inset from the edges. */
  private renderChips(labels: string[]) {
    let right = this.rect ? this.rect.x + this.rect.w / 2 - pxToCm(SPACING.videoInset) : 0
    const top = this.rect ? this.rect.y + this.rect.h / 2 - pxToCm(SPACING.videoInset) : 0
    this.chips.forEach((chip, i) => {
      // The rightmost label goes in the rightmost slot.
      const label = labels[labels.length - 1 - i]
      chip.object.enabled = !!label && !!this.rect
      if (!label || !this.rect) return
      const wPx = label.length * TYPE.chip * TAG_CHAR_EM + CHIP_PAD
      setRectSize(chip.rect, wPx, SPACING.chipHeight, RADII.chip)
      chip.text.text = label
      const w = pxToCm(wPx)
      chip.object.getTransform().setLocalPosition(new vec3(right - w / 2, top - pxToCm(SPACING.chipHeight) / 2, Z_BADGE))
      right -= w + pxToCm(SPACING.chipGap)
    })
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
