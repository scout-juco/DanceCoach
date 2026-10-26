/**
 * VideoWindow: the video panel with its count badge, chips, and its dimming
 * (lightly during a lead-in, more behind a pop-up).
 *
 * During From the top and Full the badge also shows which section is playing (SEC n).
 * A shallow view: it renders a ViewState and nothing else. Its fixed API is
 * setVideo(), setRect() (where it sits, in prototype pixels) and render() (what it shows).
 * Colours and sizes come from Theme.ts; position and size from Layout.ts.
 */
import { RoundedRectangle, TextureMode } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelCm, pxToCm, PxRect } from "./Layout"
import { RADII, SPACING, TYPE } from "./Theme"
import { childObject, isMultiSection, makeRect, makeText, setRectSize, themeColor } from "./Visuals"

// Layers in front of the video, in cm, so nothing z-fights.
const Z_DIM = 0.1
const Z_BADGE = 0.2
// Rough width of a chip character, in ems, to size the chip around its label.
const CHIP_CHAR_EM = 0.62
const CHIP_PAD = 16
// Inside the badge, from its centre: the count moves up to make room for the section under it (prototype px).
const BADGE_COUNT_UP = 7
const BADGE_SUB_DOWN = 24

/** The chips in the video's top-right corner, left to right: the speed during a run, and MIRRORED. */
function chipLabels(view: ViewState): string[] {
  const running = view.screen === "BI" || view.screen === "B0" || view.screen === "B" || view.screen === "F"
  const chips: string[] = []
  if (running) chips.push(`${view.settings.speed}×`)
  if (running && view.settings.mirror) chips.push("MIRRORED")
  return chips
}

@component
export class VideoWindow extends BaseScriptComponent {
  private frame: RoundedRectangle
  private frameObject: SceneObject
  private dim: RoundedRectangle
  private dimObject: SceneObject
  private badgeObject: SceneObject
  private badgeText: Text
  private badgeTextObject: SceneObject
  private badgeSub: Text
  private chips: { object: SceneObject; rect: RoundedRectangle; text: Text }[] = []
  private rect: { x: number; y: number; w: number; h: number } | null = null
  private lastBadge = ""
  private lastChips = "-"
  private scrim = false

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
    this.badgeTextObject = childObject("Count", this.badgeObject)
    this.badgeText = makeText(this.badgeTextObject, TYPE.countBadge, "ink", 2)
    const subObject = childObject("Section", this.badgeObject)
    subObject.getTransform().setLocalPosition(new vec3(0, -pxToCm(BADGE_SUB_DOWN), 0.05))
    this.badgeSub = makeText(subObject, TYPE.countBadgeSub, "ink2", 2)

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
    this.lastChips = "-"
  }

  render(view: ViewState) {
    const mirror = view.settings.mirror ? -1 : 1
    this.frameObject.getTransform().setLocalScale(new vec3(mirror, 1, 1))
    this.dimObject.enabled = view.video.dim
    const scrim = view.popup !== null
    if (scrim !== this.scrim) {
      this.scrim = scrim
      this.dim.backgroundColor = themeColor(scrim ? "scrim" : "dim")
    }

    // The count, if counts are on; never during a count-in, whose 5, 6, 7, 8 shows beside the video.
    // In a multi-section run the section playing shows under the count.
    const count = !view.countIn && view.settings.counts && view.count > 0 ? String(view.count) : ""
    const sub = count !== "" && isMultiSection(view) && (view.screen === "B" || view.screen === "F" || view.screen === "PV") ? `SEC ${view.runSection}` : ""
    const badge = `${count}|${sub}`
    this.badgeObject.enabled = count !== ""
    if (badge !== this.lastBadge) {
      this.lastBadge = badge
      this.badgeText.text = count
      this.badgeSub.text = sub
      this.badgeTextObject.getTransform().setLocalPosition(new vec3(0, sub ? pxToCm(BADGE_COUNT_UP) : 0, 0.05))
    }

    const chips = chipLabels(view)
    if (chips.join("|") !== this.lastChips) {
      this.lastChips = chips.join("|")
      this.renderChips(chips)
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
      const wPx = label.length * TYPE.chip * CHIP_CHAR_EM + CHIP_PAD
      setRectSize(chip.rect, wPx, SPACING.chipHeight, RADII.chip)
      chip.text.text = label
      const w = pxToCm(wPx)
      chip.object.getTransform().setLocalPosition(new vec3(right - w / 2, top - pxToCm(SPACING.chipHeight) / 2, Z_BADGE))
      right -= w + pxToCm(SPACING.chipGap)
    })
  }}
