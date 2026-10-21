/**
 * VideoWindow: the video panel with its count badge.
 *
 * A shallow view: it renders a ViewState and nothing else. Its fixed API is
 * setVideo(), setRect() (where it sits, in prototype pixels) and render() (what it shows).
 * Colours and sizes come from Theme.ts; position and size from Layout.ts.
 */
import { RoundedRectangle, TextureMode } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelCm, pxToCm, PxRect } from "./Layout"
import { COLORS, ColorToken, RADII, rgba, SPACING, TYPE } from "./Theme"

// Text em-square height in cm = size / this (Lens Studio 5.16+, as in UI Kit's TextStylePresets).
const TEXT_SIZE_PER_CM = 43.88571429
// Layers in front of the video, in cm, so nothing z-fights.
const Z_BADGE = 0.2

const color = (token: ColorToken) => {
  const [r, g, b, a] = rgba(COLORS[token])
  return new vec4(r, g, b, a)
}

@component
export class VideoWindow extends BaseScriptComponent {
  private frame: RoundedRectangle
  private frameObject: SceneObject
  private badgeObject: SceneObject
  private badgeText: Text
  private lastCount = -1

  onAwake() {
    this.frameObject = this.child("Video")
    this.frame = this.frameObject.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    this.frame.backgroundColor = color("video")
    this.frame.initialize()

    this.badgeObject = this.child("CountBadge")
    const badge = this.badgeObject.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    const d = pxToCm(SPACING.countBadge)
    badge.size = new vec2(d, d)
    badge.cornerRadius = d / 2
    badge.backgroundColor = color("countBg")
    badge.renderOrder = 1
    badge.initialize()
    badge.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto

    const textObject = this.child("Count", this.badgeObject)
    textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    textObject.createComponent("Component.ScreenTransform")
    this.badgeText = textObject.createComponent("Component.Text") as Text
    this.badgeText.size = pxToCm(TYPE.countBadge) * TEXT_SIZE_PER_CM
    this.badgeText.textFill.color = color("ink")
    this.badgeText.horizontalAlignment = HorizontalAlignment.Center
    this.badgeText.verticalAlignment = VerticalAlignment.Center
    this.badgeText.horizontalOverflow = HorizontalOverflow.Overflow
    this.badgeText.verticalOverflow = VerticalOverflow.Overflow
    this.badgeText.renderOrder = 2
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
    this.frameObject.getTransform().setLocalPosition(new vec3(r.x, r.y, 0))
    this.frame.size = new vec2(r.w, r.h)
    this.frame.cornerRadius = pxToCm(RADII.video)
    this.fitVideo()
    // The badge sits in the top-left corner, inset from the edges.
    const d = pxToCm(SPACING.countBadge)
    const inset = pxToCm(SPACING.videoInset)
    this.badgeObject.getTransform().setLocalPosition(new vec3(r.x - r.w / 2 + inset + d / 2, r.y + r.h / 2 - inset - d / 2, Z_BADGE))
  }

  render(view: ViewState) {
    const mirror = view.settings.mirror ? -1 : 1
    this.frameObject.getTransform().setLocalScale(new vec3(mirror, 1, 1))
    const showCount = view.settings.counts && view.count > 0
    this.badgeObject.enabled = showCount
    if (showCount && view.count !== this.lastCount) {
      this.badgeText.text = String(view.count)
      this.lastCount = view.count
    }
  }

  private child(name: string, parent: SceneObject = this.sceneObject): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    so.layer = this.sceneObject.layer
    return so
  }
}
