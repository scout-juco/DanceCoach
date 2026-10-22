/**
 * Banner: the strip above the video during From the top,
 * "From the top · Section 1 → end of Section N", and during the first look,
 * "First look · Full routine" (no icon).
 *
 * A shallow view: render() shows the view state, placed by the screen's banner panel
 * in Layout.SCREENS. Hidden on screens without one.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, PxRect } from "./Layout"
import { RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, makeTopIcon, place, setRectSize } from "./Visuals"

const Z = 0.1
// The icon and text sit just in front of the strip.
const Z_TEXT = 0.12
// Half the icon's width (it's 26 px wide).
const ICON_HALF = 13

@component
export class Banner extends BaseScriptComponent {
  private stripObject: SceneObject
  private strip: RoundedRectangle
  private iconObject: SceneObject
  private textObject: SceneObject
  private text: Text
  private box: PxRect | null = null
  private lastText = ""

  onAwake() {
    this.stripObject = childObject("Strip", this.sceneObject)
    this.strip = makeRect(this.stripObject, "active", 1)
    this.iconObject = childObject("Icon", this.sceneObject)
    makeTopIcon(this.iconObject, "activeInk", 2, ICON_HALF * 2)
    this.textObject = childObject("Text", this.sceneObject)
    this.text = makeText(this.textObject, TYPE.banner, "activeInk", 2, "left")
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const box = panelsFor(view).banner
    this.sceneObject.enabled = !!box
    if (!box) return
    if (box !== this.box) {
      this.box = box
      const [, , w, h] = box
      place(this.stripObject, pointInPanelCm(box, w / 2, h / 2), Z)
      setRectSize(this.strip, w, h, RADII.banner)
      place(this.iconObject, pointInPanelCm(box, SPACING.bannerIcon + ICON_HALF, h / 2), Z_TEXT)
      this.lastText = ""
    }
    const firstLook = view.screen === "PV"
    const label = firstLook ? "First look · Full routine" : `From the top · Section 1 → end of Section ${view.runStop}`
    if (label !== this.lastText) {
      this.lastText = label
      this.text.text = label
      this.iconObject.enabled = !firstLook
      const [, , , h] = box
      place(this.textObject, pointInPanelCm(box, firstLook ? SPACING.bannerIcon : SPACING.bannerText, h / 2), Z_TEXT)
    }
  }
}
