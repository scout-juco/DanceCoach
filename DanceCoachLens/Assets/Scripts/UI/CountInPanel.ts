/**
 * CountInPanel: the 5, 6, 7, 8 before every run, centred in front of you.
 *
 * It isn't on the video board: wherever the window is, it opens straight ahead of your
 * head (Layout.COUNT_IN) and glides back in front of you if you turn more than
 * COUNT_IN.followDeg away (PopupFollow). If straight ahead would cover the video, it slides
 * just clear of the video's nearer edge instead (ClearOfVideo). The starting pose adds a "Get in your starting
 * pose" heading above the circle; the "SECTION n IN" label and the 5 6 7 8 row sit under it.
 * A shallow view: render() shows the view state's count-in; setup() gives it the camera and the video.
 */
import { ViewState } from "../Core/PlaybackController"
import { AngleBox, clearYaw } from "./ClearOfVideo"
import { COUNT_IN as PLACE, pxToCm } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { SPACING, TYPE } from "./Theme"
import { VideoWindow } from "./VideoWindow"
import { childObject, makeRect, makeText, runLabel, setRectSize, themeColor } from "./Visuals"

const COUNT_IN = [5, 6, 7, 8]

@component
export class CountInPanel extends BaseScriptComponent {
  private head: SceneObject
  private number: Text
  private label: Text
  private row: Text[] = []
  private layoutKey = ""
  private camera: SceneObject | null = null
  private video: VideoWindow | null = null
  private follow = new PopupFollow(PLACE.followDeg)
  // Where the count-in is measured from: your head when it opened, gliding after you when it follows.
  private anchor = vec3.zero()
  private open = false

  onAwake() {
    // Laid out around the circle's centre, which is the panel's origin.
    this.head = childObject("StartingPose", this.sceneObject)
    makeText(this.head, TYPE.countInHead, "ink", 2).text = "GET IN YOUR STARTING POSE"
    this.head.getTransform().setLocalPosition(new vec3(0, pxToCm(PLACE.headUp), 0))

    const circle = childObject("Circle", this.sceneObject)
    setRectSize(makeRect(circle, "active", 1), SPACING.countInCircle, SPACING.countInCircle, SPACING.countInCircle / 2)
    const numberObject = childObject("Number", circle)
    this.number = makeText(numberObject, TYPE.countInNumber, "activeInk", 2)
    // Inside the circle, the number a little above centre (prototype: 92 of 200).
    const r = SPACING.countInCircle / 2
    numberObject.getTransform().setLocalPosition(new vec3(0, pxToCm(r - 92), 0.05))
    // Under the circle, the label, then the 5 6 7 8 row.
    const labelObject = childObject("Label", circle)
    this.label = makeText(labelObject, TYPE.countInLabel, "ink2", 2)
    labelObject.getTransform().setLocalPosition(new vec3(0, pxToCm(r - SPACING.countInLabelY), 0.05))

    COUNT_IN.forEach((n, i) => {
      const so = childObject(`Count${n}`, circle)
      const text = makeText(so, TYPE.countIn, "soft", 2)
      text.text = String(n)
      so.getTransform().setLocalPosition(new vec3(pxToCm((i - 1.5) * SPACING.countInRowGap), pxToCm(r - SPACING.countInRowY), 0.05))
      this.row.push(text)
    })
    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** The camera the count-in opens in front of, and the video it keeps clear of. */
  setup(camera: SceneObject, video: VideoWindow) {
    this.camera = camera
    this.video = video
  }

  render(view: ViewState) {
    const ci = view.countIn
    const show = !!ci && !!this.camera
    if (show && !this.open) this.openInFront()
    this.open = show
    this.sceneObject.enabled = show
    if (!show) {
      this.layoutKey = ""
      return
    }
    const key = `${view.screen}|${view.runKind}|${view.section}`
    if (key !== this.layoutKey) {
      this.layoutKey = key
      this.label.text = `${runLabel(view)} IN`
      this.head.enabled = ci!.kind === "startingPose"
    }
    this.number.text = String(ci!.number)
    this.row.forEach((t, i) => (t.textFill.color = themeColor(COUNT_IN[i] === ci!.number ? "ink" : "soft")))
  }

  private openInFront() {
    this.anchor = this.camera!.getTransform().getWorldPosition()
    this.follow.open(this.headYaw())
    this.place()
  }

  private update() {
    if (!this.open) return
    const a = this.follow.step(this.headYaw(), getDeltaTime())
    if (a > 0) {
      const head = this.camera!.getTransform().getWorldPosition()
      this.anchor = this.anchor.add(head.sub(this.anchor).uniformScale(a))
    }
    // Every frame, in case the window is moved or resized.
    this.place()
  }

  /** Puts the count-in COUNT_IN.distanceCm out from the anchor, ahead or just clear of the video, facing you. */
  private place() {
    const d = PLACE.distanceCm
    const angle = (px: number) => Math.atan2(pxToCm(px), d)
    const size = { half: angle(PLACE.halfWidth), up: angle(PLACE.reachUp), down: angle(PLACE.reachDown) }
    const yaw = clearYaw(this.follow.yaw, Math.atan2(-PLACE.dropCm, d), size, this.videoBox(), angle(PLACE.videoGap))
    const dir = new vec3(Math.sin(yaw), 0, Math.cos(yaw))
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(this.anchor.add(dir.uniformScale(PLACE.distanceCm)).add(new vec3(0, -PLACE.dropCm, 0)))
    t.setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }

  /** The video as seen from the anchor, as angles; null before it's placed. */
  private videoBox(): AngleBox | null {
    const edges = this.video ? this.video.worldEdges() : null
    if (!edges) return null
    const from = this.anchor
    const yawTo = (p: vec3) => Math.atan2(p.x - from.x, p.z - from.z)
    const elevTo = (p: vec3) => Math.atan2(p.y - from.y, Math.hypot(p.x - from.x, p.z - from.z))
    return { yawA: yawTo(edges.left), yawB: yawTo(edges.right), low: elevTo(edges.bottom), high: elevTo(edges.top) }
  }

  /** The way you're facing, as a yaw about the vertical. */
  private headYaw(): number {
    const look = this.camera!.getTransform().back
    return Math.atan2(look.x, look.z)
  }
}
