/**
 * LookPanel: Lookback's look panel and ATTEMPTS row (screen I, the placeholder before takes exist).
 *
 * The look panel says "LOOKBACK · SECTION n · 0 TAKES" over a "Record lookback" button, greyed out
 * until recording arrives, with "No recordings for this section yet" under it. The ATTEMPTS row
 * ("SECTION n · LOCKED") holds a disabled + button.
 * A shallow view: render() shows the view state, placed by the screen's lookPanel and attempts panels in Layout.SCREENS.
 * Hidden on screens without them.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm } from "./Layout"
import { ColorToken, RADII, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

// Layers in front of the window plane, in cm: the panels, then what sits on them.
const Z_PANEL = 0.1
const Z_ITEM = 0.2
const RECORD = { w: 220, h: 64 }
const PLUS = 36

interface Label {
  object: SceneObject
  text: Text
}

@component
export class LookPanel extends BaseScriptComponent {
  private look: SceneObject
  private lookRect: RoundedRectangle
  private head: Label
  private note: Label
  private record: SceneObject
  private attempts: SceneObject
  private attemptsRect: RoundedRectangle
  private attemptsLabel: Label
  private plus: SceneObject
  private lookW = 0
  private attemptsW = 0
  private lastKey = ""

  onAwake() {
    this.look = childObject("Look", this.sceneObject)
    this.lookRect = this.panel(this.look)
    this.head = this.label(this.look, TYPE.chip, "muted")
    this.note = this.label(this.look, TYPE.button, "muted")
    this.record = this.outlined("Record", this.look, RECORD.w, RECORD.h, RADII.control)
    this.label(this.record, TYPE.button, "soft").text.text = "Record lookback"

    this.attempts = childObject("Attempts", this.sceneObject)
    this.attemptsRect = this.panel(this.attempts)
    this.attemptsLabel = this.label(this.attempts, TYPE.chip, "muted", "left")
    this.plus = this.outlined("Plus", this.attempts, PLUS, PLUS, PLUS / 2)
    this.label(this.plus, TYPE.icon, "soft").text.text = "+"
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const { lookPanel, attempts } = panelsFor(view)
    this.sceneObject.enabled = !!lookPanel && !!attempts
    if (!lookPanel || !attempts) return
    const [, , lw, lh] = lookPanel
    if (lw !== this.lookW) {
      this.lookW = lw
      place(this.look, pointInPanelCm(lookPanel, lw / 2, lh / 2), Z_PANEL)
      setRectSize(this.lookRect, lw, lh, RADII.video)
      this.head.object.getTransform().setLocalPosition(new vec3(0, pxToCm(lh / 2 - 30), Z_ITEM))
      this.record.getTransform().setLocalPosition(new vec3(0, 0, Z_ITEM))
      this.note.object.getTransform().setLocalPosition(new vec3(0, -pxToCm(RECORD.h / 2 + 24), Z_ITEM))
    }
    const [, , aw, ah] = attempts
    if (aw !== this.attemptsW) {
      this.attemptsW = aw
      place(this.attempts, pointInPanelCm(attempts, aw / 2, ah / 2), Z_PANEL)
      setRectSize(this.attemptsRect, aw, ah, RADII.bar)
      this.attemptsLabel.object.getTransform().setLocalPosition(new vec3(-pxToCm(aw / 2 - 20), 0, Z_ITEM))
      this.plus.getTransform().setLocalPosition(new vec3(-pxToCm(aw / 2 - 250), 0, Z_ITEM))
    }
    const key = `${view.section}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.head.text.text = `LOOKBACK · SECTION ${view.section} · 0 TAKES`
    this.note.text.text = "No recordings for this section yet"
    this.attemptsLabel.text.text = `ATTEMPTS   SECTION ${view.section} · LOCKED`
  }

  /** A bordered panel, sized on first render. */
  private panel(parent: SceneObject): RoundedRectangle {
    const rect = makeRect(parent, "panel", 1)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("stroke")
    return rect
  }

  /** A greyed-out, unpressable button. */
  private outlined(name: string, parent: SceneObject, w: number, h: number, radius: number): SceneObject {
    const so = childObject(name, parent)
    const rect = makeRect(so, "panel", 2)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("ghostLine")
    setRectSize(rect, w, h, radius)
    return so
  }

  private label(parent: SceneObject, sizePx: number, token: ColorToken, align: "left" | "center" = "center"): Label {
    const object = childObject("Label", parent)
    object.getTransform().setLocalPosition(new vec3(0, 0, Z_ITEM / 2))
    return { object, text: makeText(object, sizePx, token, 4, align) }
  }
}
