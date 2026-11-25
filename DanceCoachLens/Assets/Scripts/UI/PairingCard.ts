/**
 * PairingCard: the "Pair your phone" dialog, shown while no phone is paired with these Specs.
 *
 * Title, a line saying what to do, the code in Count XL, and a caption. Built from the B2 kit like Record lookback?: Dialog surface
 * (#23262B fill, 1 px border, radius 24, padding 32), heading, Body and Count XL text. Not on the video board: it opens in front of your
 * head (Layout.RECORD_POPUP) and glides back in front of you if you turn away (PopupFollow). It closes once a phone is paired and
 * doesn't come back unless that phone is unpaired.
 * A shallow view: render() shows the link's code, or hides the card when it is null.
 */
import { PAIR_BODY, PAIR_TITLE, PAIR_WAITING, pairCodeText } from "../Core/DialogCopy"
import { pxToCm, RECORD_POPUP } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { ColorToken, RADIUS, SPACE } from "./Theme"
import { childObject, makeSurface, makeText } from "./Visuals"

const Z_ITEM = 0.1
// Over the Record popup and the video board, which can both be up behind it.
const ORDER = 20

const PAD = 32
const W = 480
const TITLE_Y = PAD
const BODY_Y = TITLE_Y + 32 + SPACE.attached
const CODE_Y = BODY_Y + 48 + SPACE.surface
const CODE_H = 40
const CAPTION_Y = CODE_Y + CODE_H + SPACE.surface
const H = CAPTION_Y + 20 + PAD

@component
export class PairingCard extends BaseScriptComponent {
  private camera: SceneObject | null = null
  private card: SceneObject
  private code: Text
  private follow = new PopupFollow()
  private anchor = vec3.zero()
  private open = false
  private lastCode = ""

  onAwake() {
    this.card = childObject("Card", this.sceneObject)
    makeSurface(this.card, { fill: "panelSolid", border: "border", borderPx: 1, radius: RADIUS.lg }, ORDER, W, H)
    this.text("heading", "text", "center", W / 2, TITLE_Y + 16).text = PAIR_TITLE
    this.text("body", "textMuted", "center", W / 2, BODY_Y + 24).text = PAIR_BODY
    this.code = this.text("countXl", "text", "center", W / 2, CODE_Y + CODE_H / 2)
    this.text("caption", "textMuted", "center", W / 2, CAPTION_Y + 10).text = PAIR_WAITING
    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** The camera the card opens in front of. */
  setup(camera: SceneObject) {
    this.camera = camera
  }

  /** Shows the card with this code, or hides it when the code is null. */
  render(pairCode: string | null) {
    const show = !!pairCode && !!this.camera
    if (show && !this.open) this.openInFront()
    this.open = show
    this.sceneObject.enabled = show
    if (!show || !pairCode || pairCode === this.lastCode) return
    this.lastCode = pairCode
    this.code.text = pairCodeText(pairCode)
  }

  private openInFront() {
    this.anchor = this.camera!.getTransform().getWorldPosition()
    this.follow.open(this.headYaw())
    this.place()
  }

  private update() {
    if (!this.open) return
    const a = this.follow.step(this.headYaw(), getDeltaTime())
    if (a === 0) return
    const head = this.camera!.getTransform().getWorldPosition()
    this.anchor = this.anchor.add(head.sub(this.anchor).uniformScale(a))
    this.place()
  }

  private place() {
    const yaw = this.follow.yaw
    const dir = new vec3(Math.sin(yaw), 0, Math.cos(yaw))
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(this.anchor.add(dir.uniformScale(RECORD_POPUP.distanceCm)).add(new vec3(0, -RECORD_POPUP.dropCm, 0)))
    t.setLocalScale(new vec3(RECORD_POPUP.scale, RECORD_POPUP.scale, RECORD_POPUP.scale))
    t.setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }

  private headYaw(): number {
    const look = this.camera!.getTransform().back
    return Math.atan2(look.x, look.z)
  }

  /** A line of text anchored at (x, y centre) px from the card's top-left. */
  private text(style: Parameters<typeof makeText>[1], token: ColorToken, align: "left" | "right" | "center", xPx: number, yPx: number): Text {
    const so = childObject("Text", this.card)
    so.getTransform().setLocalPosition(new vec3(pxToCm(xPx - W / 2), -pxToCm(yPx - H / 2), Z_ITEM))
    return makeText(so, style, token, ORDER + 2, align)
  }
}
