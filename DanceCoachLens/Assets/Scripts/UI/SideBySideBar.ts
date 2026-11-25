/**
 * SideBySideBar: what screen M shows around its two videos (B2LookWatch, BUILD_SPEC §6).
 *
 * The eyebrows 24 above them ("ORIGINAL · MIRRORED", "YOU · LOOKBACK FROM PHONE"), the "TAKE n · 0.75×" pill on the take's
 * bottom-left corner, and the play bar 16 under them: a 48 volt play/pause circle, then 12 along an 8-tall scrub track
 * (white up to a 4×16 volt playhead) with the counts 1–8 under it, the current one volt.
 * Pinching the play button calls onPlay; pinching and dragging the track calls onScrub with how far along it the hand is
 * (0 to 1) and onScrubEnd when it lets go.
 * A shallow view: render() shows the Lookback view, placed by the screen's video, take and sbsBar panels in Layout.SCREENS.
 * Hidden on every other screen. The outlines and rings (pink on the take, volt on the original) are the VideoWindows' (Overlay).
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { LookbackView, originalHead, TAKE_HEAD, takeLabel } from "../Core/LookbackController"
import { ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect } from "./Layout"
import { ColorToken, RADIUS, SIZE, SPACE, TEXT, TextStyleName } from "./Theme"
import { addHover, childObject, Icon, makeIcon, makePill, makeText, place, setRectSize, themeColor } from "./Visuals"

const Z_ITEM = 0.2
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
/** The eyebrow's line sits this far above its video: 16 of text, 8 gap. */
const EYEBROW_UP = TEXT.eyebrow.lineHeight + SPACE.group
/** The take pill: 16 in from the take's left and bottom edges, padded 16 a side; sized from its label (Sora 700, mostly capitals). */
const TAG_INSET = 16
const TAG_PAD = 16
const TAG_CHAR_EM = 0.7
/** The play bar (prototype px, from the bar's top-left): the 48 circle, then the track 12 along it. */
const PLAY_D = 48
const PLAY_ICON = 16
const TRACK_X = PLAY_D + SPACE.between
/** The track and its labels are one 32-tall column (8 track, 8 gap, 16 labels), centred on the circle. */
const TRACK_H = SIZE.bar
const TRACK_Y = (PLAY_D - (TRACK_H + SPACE.group + TEXT.label.lineHeight)) / 2
const LABELS_Y = TRACK_Y + TRACK_H + SPACE.group + TEXT.label.lineHeight / 2
const PLAYHEAD = { w: 4, h: 16 }
/** The labels are spread edge to edge (the first starts at the track's left, the last ends at its right): about this wide. */
const LABEL_W = 8
// The grab area is taller than the track, to be easy to pinch.
const SCRUB_HIT_H = PLAY_D

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
  private tagObject: SceneObject
  private tagRect: RoundedRectangle
  private tag: Label
  private playObject: SceneObject
  private playIcon: Icon
  private pauseIcon: Icon
  private scrubObject: SceneObject
  private scrubWidthCm = 1
  private trackObject: SceneObject
  private track: RoundedRectangle
  private fillObject: SceneObject
  private fill: RoundedRectangle
  private playheadObject: SceneObject
  private marks: Label[] = []
  private placed = ""
  private lastKey = ""

  onAwake() {
    this.originalHeadLabel = this.label(this.sceneObject, "eyebrow", "textMuted", "left")
    this.takeHeadLabel = this.label(this.sceneObject, "eyebrow", "textMuted", "left")
    this.takeHeadLabel.text.text = TAKE_HEAD

    this.tagObject = childObject("TakePill", this.sceneObject)
    this.tagRect = makePill(this.tagObject, "scrim", 3, 1, SIZE.chip)
    this.tag = this.label(this.tagObject, "chip", "text", "center")
    place(this.tag.object, new vec2(0, 0), Z_LABEL)

    this.playObject = childObject("Play", this.sceneObject)
    const playRect = makePill(this.playObject, "volt", 2, PLAY_D, PLAY_D)
    this.hittable(this.playObject, PLAY_D, PLAY_D).onTriggerEnd.add(() => this.onPlay())
    addHover(this.playObject, playRect)
    this.playIcon = makeIcon(this.playObject, "play", "onColor", 3, PLAY_ICON)
    this.pauseIcon = makeIcon(this.playObject, "pause", "onColor", 3, PLAY_ICON)
    for (const icon of [this.playIcon, this.pauseIcon]) icon.object.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))

    this.trackObject = childObject("Track", this.sceneObject)
    this.track = makePill(this.trackObject, "control", 2, 1, TRACK_H)
    this.fillObject = childObject("Fill", this.sceneObject)
    this.fill = makePill(this.fillObject, "text", 3, 1, TRACK_H)
    this.playheadObject = childObject("Playhead", this.sceneObject)
    makePill(this.playheadObject, "volt", 4, PLAYHEAD.w, PLAYHEAD.h)
    for (let i = 1; i <= 8; i++) {
      const mark = this.label(this.sceneObject, "label", "textMuted", "center")
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
      this.lastKey = ""
      this.layout(box, panels.video, panels.take, sbs.counts, sbs.sections)
    }
    const mirror = view.settings.mirror
    const tag = takeLabel(sbs.take)
    const key = `${sbs.count}|${sbs.fraction}|${sbs.playing}|${tag}|${mirror}|${sbs.sections}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.originalHeadLabel.text.text = originalHead(mirror)
    this.renderTag(panels.take, tag)
    this.playIcon.object.enabled = !sbs.playing
    this.pauseIcon.object.enabled = sbs.playing

    const tw = box[2] - TRACK_X
    const frac = Math.min(Math.max(sbs.fraction, 0), 1)
    // The playhead sits in the middle of the count on show, as the prototype's does, until the section plays past it.
    const at = sbs.playing || sbs.fraction >= 1 ? frac : (sbs.count - 0.5) / sbs.counts
    const fillW = Math.max(tw * at, TRACK_H)
    place(this.fillObject, pointInPanelCm(box, TRACK_X + fillW / 2, TRACK_Y + TRACK_H / 2), Z_ITEM + Z_LABEL)
    setRectSize(this.fill, fillW, TRACK_H, RADIUS.pill)
    place(this.playheadObject, pointInPanelCm(box, TRACK_X + tw * at, TRACK_Y + TRACK_H / 2), Z_ITEM + 2 * Z_LABEL)
    // The mark on show: this count, or (a whole routine) the section it's in.
    const on = sbs.sections ? Math.min(Math.floor(((sbs.count - 1) / sbs.counts) * sbs.sections), sbs.sections - 1) + 1 : sbs.count
    this.marks.forEach((m, i) => {
      m.text.textFill.color = themeColor(i + 1 === on ? "volt" : "textMuted")
    })
  }

  private layout(box: PxRect, video: PxRect, take: PxRect, counts: number, sections: number) {
    const tw = box[2] - TRACK_X
    place(this.playObject, pointInPanelCm(box, PLAY_D / 2, PLAY_D / 2), Z_ITEM)
    place(this.trackObject, pointInPanelCm(box, TRACK_X + tw / 2, TRACK_Y + TRACK_H / 2), Z_ITEM)
    setRectSize(this.track, tw, TRACK_H, RADIUS.pill)
    place(this.scrubObject, pointInPanelCm(box, TRACK_X + tw / 2, PLAY_D / 2), Z_ITEM + 3 * Z_LABEL)
    this.setHitBox(this.scrubObject, tw, SCRUB_HIT_H)
    this.scrubWidthCm = pxToCm(tw)
    // A short last section has fewer counts: its marks are spread over the same track.
    const step = counts > 1 ? (tw - LABEL_W) / (counts - 1) : 0
    this.marks.forEach((mark, i) => {
      // A whole routine marks its sections instead of its counts: each label sits where its section starts.
      mark.object.enabled = i < (sections || counts)
      mark.text.text = String(i + 1)
      const x = sections ? TRACK_X + (tw * i) / sections + LABEL_W / 2 : TRACK_X + LABEL_W / 2 + i * step
      place(mark.object, pointInPanelCm(box, x, LABELS_Y), Z_ITEM)
    })
    const eyebrowY = -EYEBROW_UP + TEXT.eyebrow.lineHeight / 2
    place(this.originalHeadLabel.object, pointInPanelCm(video, 0, eyebrowY), Z_ITEM)
    place(this.takeHeadLabel.object, pointInPanelCm(take, 0, eyebrowY), Z_ITEM)
  }

  /** The take pill, sized to its label and hung 16 in from the take's bottom-left corner. */
  private renderTag(take: PxRect, label: string) {
    this.tag.text.text = label
    const w = Math.round(label.length * TEXT.chip.size * TAG_CHAR_EM) + 2 * TAG_PAD
    setRectSize(this.tagRect, w, SIZE.chip, RADIUS.pill)
    place(this.tagObject, pointInPanelCm(take, TAG_INSET + w / 2, take[3] - TAG_INSET - SIZE.chip / 2), Z_ITEM)
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

  private label(parent: SceneObject, style: TextStyleName, token: ColorToken, align: "left" | "center" | "right"): Label {
    const object = childObject("Label", parent)
    return { object, text: makeText(object, style, token, 5, align) }
  }
}
