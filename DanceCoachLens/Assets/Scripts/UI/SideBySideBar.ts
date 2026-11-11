/**
 * SideBySideBar: what screen M shows around its two videos.
 *
 * The headings over them ("ORIGINAL · MIRRORED", "YOU · LOOKBACK FROM PHONE"), the "TAKE n · 0.75×" tag on the take, and under
 * them the play/pause button and the scrub bar marked 1–8. Pinching the play button calls onPlay; pinching and dragging the bar
 * calls onScrub with how far along it the hand is (0 to 1) and onScrubEnd when it lets go.
 * A shallow view: render() shows the Lookback view, placed by the screen's video, take and sbsBar panels in Layout.SCREENS.
 * Hidden on every other screen.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { LookbackView, originalHead, TAKE_HEAD, takeLabel } from "../Core/LookbackController"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { ColorToken, RADII, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

const Z_ITEM = 0.2
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
// The headings sit this far above their video's top edge (prototype px).
const HEAD_UP = 11
// The tag on the take, from the video's left and bottom edges.
const TAG_INSET = 12
// Inside the bar (prototype px): the play button's diameter, where the track starts, its top and height, the handle and the marks' row.
const PLAY_D = 44
const TRACK_X = 56
const TRACK_Y = 12
const TRACK_H = 8
const HANDLE = { w: 4, h: 18 }
const MARKS_Y = 34
// The grab area is taller than the track, to be easy to pinch.
const SCRUB_HIT_H = 44

interface Label {
  object: SceneObject
  text: Text
}

@component
export class SideBySideBar extends BaseScriptComponent {
  /** Called when the play/pause button is pinched. */
  onPlay: () => void = () => {}
  /** Called while the scrub bar is pinched, with how far along it the hand is (0 to 1). */
  onScrub: (fraction: number) => void = () => {}
  /** Called when the scrub bar is let go. */
  onScrubEnd: () => void = () => {}

  private originalHeadLabel: Label
  private takeHeadLabel: Label
  private tag: Label
  private tagRect: RoundedRectangle
  private bar: RoundedRectangle
  private barObject: SceneObject
  private playObject: SceneObject
  private playDisc: RoundedRectangle
  private playLabel: Text
  private scrubObject: SceneObject
  private scrubWidthCm = 1
  private trackObject: SceneObject
  private track: RoundedRectangle
  private fillObject: SceneObject
  private fill: RoundedRectangle
  private handleObject: SceneObject
  private marks: Label[] = []
  private tagObject: SceneObject
  private placed = ""
  private lastKey = ""

  onAwake() {
    this.originalHeadLabel = this.label(this.sceneObject, TYPE.chip, "ink2", "left")
    this.takeHeadLabel = this.label(this.sceneObject, TYPE.chip, "ink2", "left")
    this.takeHeadLabel.text.text = TAKE_HEAD
    this.tagObject = childObject("Tag", this.sceneObject)
    this.tagRect = makeRect(this.tagObject, "chip", 3)
    this.tag = this.label(this.tagObject, TYPE.chip, "ink", "center")

    this.barObject = childObject("Bar", this.sceneObject)
    this.bar = makeRect(this.barObject, "panel", 1)
    this.bar.border = true
    this.bar.borderSize = pxToCm(1)
    this.bar.borderColor = themeColor("stroke")

    this.playObject = childObject("Play", this.sceneObject)
    this.playDisc = makeRect(this.playObject, "active", 2)
    setRectSize(this.playDisc, PLAY_D, PLAY_D, PLAY_D / 2)
    this.hittable(this.playObject, PLAY_D, PLAY_D).onTriggerEnd.add(() => this.onPlay())
    const playLabel = this.label(this.playObject, TYPE.icon, "activeInk", "center")
    this.playLabel = playLabel.text

    this.trackObject = childObject("Track", this.sceneObject)
    this.track = makeRect(this.trackObject, "track", 2)
    this.fillObject = childObject("Fill", this.sceneObject)
    this.fill = makeRect(this.fillObject, "muted", 3)
    this.handleObject = childObject("Handle", this.sceneObject)
    setRectSize(makeRect(this.handleObject, "ink", 4), HANDLE.w, HANDLE.h, 2)
    for (let i = 1; i <= 8; i++) {
      const mark = this.label(this.sceneObject, TYPE.chip, "ink2", "center")
      mark.text.text = String(i)
      this.marks.push(mark)
    }
    // The scrub bar's grab area: pinch anywhere along it and drag.
    this.scrubObject = childObject("Scrub", this.sceneObject)
    const scrub = this.hittable(this.scrubObject, 1, 1)
    scrub.onTriggerStart.add((e) => this.scrubTo(e))
    scrub.onTriggerUpdate.add((e) => this.scrubTo(e))
    scrub.onTriggerEnd.add(() => this.onScrubEnd())
    scrub.onTriggerCanceled.add(() => this.onScrubEnd())
    this.sceneObject.enabled = false
  }

  render(view: ViewState, look: LookbackView | null) {
    const panels = panelsFor(view)
    const box = panels.sbsBar
    const sbs = look && look.sideBySide
    this.sceneObject.enabled = !!box && !!panels.video && !!panels.take && !!sbs
    if (!box || !panels.video || !panels.take || !sbs) {
      this.placed = ""
      this.lastKey = ""
      return
    }
    const placed = [box, panels.video, panels.take].map((r) => r.join(",")).join("|") + `|${sbs.counts}`
    if (placed !== this.placed) {
      this.placed = placed
      this.layout(box, panels.video, panels.take, sbs.counts)
    }
    const mirror = view.settings.mirror
    const key = `${sbs.count}|${sbs.fraction}|${sbs.playing}|${sbs.take.name}|${mirror}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.originalHeadLabel.text.text = originalHead(mirror)
    this.tag.text.text = takeLabel(sbs.take)
    this.playLabel.text = sbs.playing ? "❚❚" : "▶"

    const tw = box[2] - TRACK_X
    const frac = Math.min(Math.max(sbs.fraction, 0), 1)
    // The marker sits in the middle of the count on show, as the prototype's does, until the section plays past it.
    const at = sbs.playing || sbs.fraction >= 1 ? frac : (sbs.count - 0.5) / sbs.counts
    place(this.fillObject, pointInPanelCm(box, TRACK_X + (tw * at) / 2, TRACK_Y + TRACK_H / 2), Z_ITEM + Z_LABEL)
    setRectSize(this.fill, Math.max(tw * at, 1), TRACK_H, TRACK_H / 2)
    place(this.handleObject, pointInPanelCm(box, TRACK_X + tw * at, TRACK_Y + TRACK_H / 2), Z_ITEM + 2 * Z_LABEL)
    this.marks.forEach((m, i) => {
      m.text.textFill.color = themeColor(i + 1 === sbs.count ? "ink" : "ink2")
    })
  }

  private layout(box: PxRect, video: PxRect, take: PxRect, counts: number) {
    const [, , w, h] = box
    const tw = w - TRACK_X
    place(this.barObject, pointInPanelCm(box, w / 2, h / 2), 0.1)
    setRectSize(this.bar, w, h, RADII.bar)
    place(this.playObject, pointInPanelCm(box, PLAY_D / 2, h / 2), Z_ITEM)
    place(this.trackObject, pointInPanelCm(box, TRACK_X + tw / 2, TRACK_Y + TRACK_H / 2), Z_ITEM)
    setRectSize(this.track, tw, TRACK_H, TRACK_H / 2)
    place(this.scrubObject, pointInPanelCm(box, TRACK_X + tw / 2, h / 2), Z_ITEM + 3 * Z_LABEL)
    this.setHitBox(this.scrubObject, tw, SCRUB_HIT_H)
    this.scrubWidthCm = pxToCm(tw)
    // A short last section has fewer counts: the bar's stops and marks are spread over those.
    this.marks.forEach((mark, i) => {
      mark.object.enabled = i < counts
      place(mark.object, pointInPanelCm(box, TRACK_X + ((i + 0.5) * tw) / counts, MARKS_Y), Z_ITEM)
    })
    place(this.originalHeadLabel.object, pointInPanelCm(video, 0, -HEAD_UP), Z_ITEM)
    place(this.takeHeadLabel.object, pointInPanelCm(take, 0, -HEAD_UP), Z_ITEM)
    // The tag sits on the take's bottom-left corner.
    const tagW = 120
    const tagH = 22
    setRectSize(this.tagRect, tagW, tagH, RADII.chip)
    place(this.tagObject, pointInPanelCm(take, TAG_INSET + tagW / 2, take[3] - TAG_INSET - tagH / 2), Z_ITEM)
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

  private hittable(object: SceneObject, wPx: number, hPx: number): Interactable {
    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    this.setHitBox(object, wPx, hPx)
    return object.createComponent(Interactable.getTypeName()) as Interactable
  }

  private label(parent: SceneObject, sizePx: number, token: ColorToken, align: "left" | "center" | "right"): Label {
    const object = childObject("Label", parent)
    return { object, text: makeText(object, sizePx, token, 4, align) }
  }
}
