/**
 * PoseBar: the Pose bar (screen E), the thin scrub line opened up.
 *
 * The scrub bar marked 1 & 2 & … 8 &, then the mode button, Mirror, Half counts, ‹ and ›
 * and Play from here. Mirror, Half counts, ‹ and › and the mode button work, and pinching and dragging the scrub bar
 * calls onScrub / onScrubEnd.
 * A shallow view: render() shows the Pose view, placed by the screen's poseBar panel in Layout.SCREENS.
 * `aimed` says whether the hand ray is on the bar, so the Lens can keep it open.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { STILLS_PER_SECTION } from "../Core/DancePackage"
import { MODES, ViewState } from "../Core/PlaybackController"
import { PoseView } from "../Core/PoseController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { ColorToken, RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

const Z_BAR = 0.1
const Z_CONTROL = 0.2
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1

// Inside the panel, in prototype px (the prototype's drawPosePanel): the scrub bar's inset, top and height,
// its handle, the labels' row, and the buttons' row.
const SCRUB_X = 14
const SCRUB_Y = 16
const SCRUB_H = 12
// The grab area is taller than the line, to be easy to pinch.
const SCRUB_HIT_H = 40
const HANDLE = { w: 22, h: 28 }
const LABEL_Y = 48
const BUTTONS_Y = 62
const BUTTON_H = 52
const BUTTON_GAP = 8
const BUTTON_W = { mode: 170, toggle: 84, step: 56, play: 130 }

export type PoseBarCommand = "mode" | "mirror" | "halfCounts" | "back" | "forward" | "playFromHere"

interface Button {
  command: PoseBarCommand
  object: SceneObject
  rect: RoundedRectangle
  widthPx: number
}

@component
export class PoseBar extends BaseScriptComponent {
  /** Called when a button is pinched. */
  onPress: (command: PoseBarCommand) => void = () => {}

  /** Called while the scrub bar is pinched, with how far along it the hand is (0 to 1). */
  onScrub: (fraction: number) => void = () => {}
  /** Called when the scrub bar is let go. */
  onScrubEnd: () => void = () => {}

  private hovered = 0
  private scrubObject: SceneObject
  private scrubWidthCm = 1
  private bar: RoundedRectangle
  private barObject: SceneObject
  private track: RoundedRectangle
  private trackObject: SceneObject
  private fill: RoundedRectangle
  private fillObject: SceneObject
  private handleObject: SceneObject
  private labels: { object: SceneObject; text: Text }[] = []
  private buttons: Button[] = []
  private modeName: Text
  private modeNext: Text
  private mirrorState: Text
  private halfState: Text
  private backLabel: Text
  private forwardLabel: Text
  private placed = ""
  private lastKey = ""

  /** True while the hand ray is on the bar or any of its buttons. */
  get aimed(): boolean {
    return this.hovered > 0
  }

  onAwake() {
    this.barObject = childObject("Bar", this.sceneObject)
    this.bar = makeRect(this.barObject, "panel", 1)
    this.bar.border = true
    this.bar.borderSize = pxToCm(1)
    this.bar.borderColor = themeColor("stroke")
    this.hoverable(this.barObject, 1, 1)
    // The scrub bar's grab area: pinch anywhere along it and drag.
    this.scrubObject = childObject("Scrub", this.sceneObject)
    const scrub = this.hoverable(this.scrubObject, 1, 1)
    scrub.onTriggerStart.add((e) => this.scrubTo(e))
    scrub.onTriggerUpdate.add((e) => this.scrubTo(e))
    scrub.onTriggerEnd.add(() => this.onScrubEnd())
    scrub.onTriggerCanceled.add(() => this.onScrubEnd())
    this.trackObject = childObject("Track", this.sceneObject)
    this.track = makeRect(this.trackObject, "on", 2)
    this.fillObject = childObject("Fill", this.sceneObject)
    this.fill = makeRect(this.fillObject, "muted", 3)
    this.handleObject = childObject("Handle", this.sceneObject)
    setRectSize(makeRect(this.handleObject, "ink", 4), HANDLE.w, HANDLE.h, 6)
    for (let i = 0; i < STILLS_PER_SECTION; i++) {
      const object = childObject(`Mark${i}`, this.sceneObject)
      const text = makeText(object, TYPE.chip, "ink2", 4)
      text.text = i % 2 ? "&" : String(i / 2 + 1)
      this.labels.push({ object, text })
    }

    const mode = this.button("mode", BUTTON_W.mode)
    mode.rect.borderColor = themeColor("ink")
    this.modeName = this.label(mode.object, TYPE.modeName, "ink", 0, -9)
    this.modeNext = this.label(mode.object, TYPE.modeNext, "muted", 0, 11)
    const mirror = this.button("mirror", BUTTON_W.toggle)
    this.label(mirror.object, TYPE.chip, "ink", 0, -8).text = "Mirror"
    this.mirrorState = this.label(mirror.object, TYPE.chip, "ink", 0, 8)
    const half = this.button("halfCounts", BUTTON_W.toggle)
    this.label(half.object, TYPE.chip, "ink", 0, -8).text = "Half counts"
    this.halfState = this.label(half.object, TYPE.chip, "ink", 0, 8)
    this.backLabel = this.label(this.button("back", BUTTON_W.step).object, TYPE.button, "ink", 0, 0)
    this.forwardLabel = this.label(this.button("forward", BUTTON_W.step).object, TYPE.button, "ink", 0, 0)
    const play = this.button("playFromHere", BUTTON_W.play)
    play.rect.backgroundColor = themeColor("active")
    play.rect.borderColor = themeColor("active")
    this.label(play.object, TYPE.button, "activeInk", 0, 0).text = "▶ Play from here"
    this.sceneObject.enabled = false
  }

  render(view: ViewState, pose: PoseView | null) {
    const box = panelsFor(view).poseBar
    this.sceneObject.enabled = !!box && !!pose
    if (!box || !pose) {
      // A hidden bar sends no hover-exit.
      this.hovered = 0
      this.placed = ""
      this.lastKey = ""
      return
    }
    if (box.join(",") !== this.placed) {
      this.placed = box.join(",")
      this.layout(box)
    }
    const st = view.settings
    const key = `${pose.step}|${view.mode}|${st.mirror}|${pose.halfCounts}`
    if (key === this.lastKey) return
    this.lastKey = key

    const sw = box[2] - 2 * SCRUB_X
    const frac = (pose.step + 0.5) / STILLS_PER_SECTION
    place(this.fillObject, pointInPanelCm(box, SCRUB_X + (sw * frac) / 2, SCRUB_Y + SCRUB_H / 2), Z_CONTROL + Z_LABEL)
    setRectSize(this.fill, sw * frac, SCRUB_H, SCRUB_H / 2)
    place(this.handleObject, pointInPanelCm(box, SCRUB_X + sw * frac, SCRUB_Y + SCRUB_H / 2), Z_CONTROL + 2 * Z_LABEL)
    this.labels.forEach(({ text }, i) => (text.textFill.color = themeColor(i === pose.step ? "ink" : "ink2")))

    const m = MODES.indexOf(view.mode)
    this.modeName.text = `↻ ${view.mode}`
    this.modeNext.text = `NEXT: ${MODES[(m + 1) % MODES.length].toUpperCase()}`
    this.buttons.find((b) => b.command === "mirror")!.rect.backgroundColor = themeColor(st.mirror ? "on" : "panel")
    this.mirrorState.text = st.mirror ? "on" : "off"
    this.buttons.find((b) => b.command === "halfCounts")!.rect.backgroundColor = themeColor(pose.halfCounts ? "on" : "panel")
    this.halfState.text = pose.halfCounts ? "on" : "off"
    // The steps' size: a count, or half of one.
    this.backLabel.text = pose.halfCounts ? "‹ ½" : "‹ 1"
    this.forwardLabel.text = pose.halfCounts ? "½ ›" : "1 ›"
  }

  private layout(box: PxRect) {
    const [, , w, h] = box
    const sw = w - 2 * SCRUB_X
    place(this.barObject, pointInPanelCm(box, w / 2, h / 2), Z_BAR)
    setRectSize(this.bar, w, h, RADII.bar)
    this.setHitBox(this.barObject, w, h)
    place(this.scrubObject, pointInPanelCm(box, w / 2, SCRUB_Y + SCRUB_H / 2), Z_CONTROL + 3 * Z_LABEL)
    this.setHitBox(this.scrubObject, sw, SCRUB_HIT_H)
    this.scrubWidthCm = pxToCm(sw)
    place(this.trackObject, pointInPanelCm(box, w / 2, SCRUB_Y + SCRUB_H / 2), Z_CONTROL)
    setRectSize(this.track, sw, SCRUB_H, SCRUB_H / 2)
    this.labels.forEach(({ object }, i) => place(object, pointInPanelCm(box, SCRUB_X + (i + 0.5) * (sw / STILLS_PER_SECTION), LABEL_Y), Z_CONTROL))
    let x = SPACING.barPad + 2
    for (const b of this.buttons) {
      place(b.object, pointInPanelCm(box, x + b.widthPx / 2, BUTTONS_Y + BUTTON_H / 2), Z_CONTROL)
      x += b.widthPx + BUTTON_GAP
      // A wider gap before ‹ ›, like the prototype's divider.
      if (b.command === "halfCounts") x += BUTTON_GAP
    }
  }

  /** Where along the scrub bar the pinch is, from the ray's point on the bar's plane. */
  private scrubTo(e: InteractorEvent) {
    const p = e.interactor.planecastPoint
    if (!p) return
    const local = this.scrubObject.getTransform().getInvertedWorldTransform().multiplyPoint(p)
    this.onScrub(local.x / this.scrubWidthCm + 0.5)
  }

  private setHitBox(object: SceneObject, wPx: number, hPx: number) {
    const collider = object.getComponent("ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
    collider.shape = shape
  }

  /** A pressable rounded button. */
  private button(command: PoseBarCommand, widthPx: number): Button {
    const object = childObject(command, this.sceneObject)
    const rect = makeRect(object, "panel", 5)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("soft")
    setRectSize(rect, widthPx, BUTTON_H, RADII.control)
    this.hoverable(object, widthPx, BUTTON_H).onTriggerEnd.add(() => this.onPress(command))
    const button = { command, object, rect, widthPx }
    this.buttons.push(button)
    return button
  }

  /** Gives an object a hit area whose hover counts towards `aimed`. */
  private hoverable(object: SceneObject, wPx: number, hPx: number): Interactable {
    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    this.setHitBox(object, wPx, hPx)
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onHoverEnter.add(() => this.hovered++)
    interactable.onHoverExit.add(() => (this.hovered = Math.max(0, this.hovered - 1)))
    return interactable
  }

  private label(parent: SceneObject, sizePx: number, token: ColorToken, xPx: number, yPx: number): Text {
    const so = childObject("Label", parent)
    so.getTransform().setLocalPosition(new vec3(pxToCm(xPx), -pxToCm(yPx), Z_LABEL))
    return makeText(so, sizePx, token, 6)
  }
}
