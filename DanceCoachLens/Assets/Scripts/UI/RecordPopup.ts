/**
 * RecordPopup: the "Record lookback?" pop-up (screen J).
 *
 * The section, the speed · mirror the take will use, and whether the phone camera is connected, over
 * "Yes, record" (greyed out until the phone is connected, with "Not connected: open /record on your phone"
 * under the rows) and "Not now". It isn't on the video board: like Routine done it opens in front of your head
 * (Layout.RECORD_POPUP, a little farther out and scaled down) and glides back in front of you if you turn more than POPUP.followDeg away (PopupFollow).
 * A shallow view: render() shows the Lookback view while it's on J.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { LookbackView } from "../Core/LookbackController"
import { pxToCm, RECORD_POPUP, SCREENS } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { ColorToken, RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, setRectSize, themeColor } from "./Visuals"

// Layers in front of the card, in cm: its buttons, then their labels.
const Z_ITEM = 0.1
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
// Drawn after the video board, which sits behind it.
const ORDER = 10
const ROWS_Y = 112
const ROW_GAP = 30
const BUTTON_H = 56
const NOT_CONNECTED = "Not connected: open /record on your phone"

interface Button {
  object: SceneObject
  rect: RoundedRectangle
  text: Text
}

@component
export class RecordPopup extends BaseScriptComponent {
  /** Called when "Yes, record" is pinched. */
  onYes: () => void = () => {}
  /** Called when "Not now" is pinched. */
  onNo: () => void = () => {}

  private camera: SceneObject | null = null
  private card: SceneObject
  private values: Text[] = []
  private hint: Text
  private yes: Button
  private no: Button
  private follow = new PopupFollow()
  // Where the pop-up is measured from: your head when it opened, gliding after you when it follows.
  private anchor = vec3.zero()
  private open = false
  private connected = false
  private lastKey = ""
  private readonly w = SCREENS.J.popup![2]
  private readonly h = SCREENS.J.popup![3]

  onAwake() {
    const pad = SPACING.popupPad
    this.card = childObject("Card", this.sceneObject)
    const bg = makeRect(this.card, "panel", ORDER)
    bg.border = true
    bg.borderSize = pxToCm(1)
    bg.borderColor = themeColor("stroke")
    setRectSize(bg, this.w, this.h, RADII.popup)

    this.text(TYPE.popupTitle, "ink", "left", pad, pad + 14).text = "Record lookback?"
    this.text(TYPE.button, "ink2", "left", pad, pad + 52).text = "Your recording uses the settings of this section."
    const labels = ["Section", "Speed · mirror", "Phone camera"]
    labels.forEach((label, i) => {
      this.text(TYPE.popupButton, "ink", "left", pad, ROWS_Y + i * ROW_GAP).text = label
      this.values.push(this.text(TYPE.chip, "ink2", "right", this.w - pad, ROWS_Y + i * ROW_GAP))
    })
    this.hint = this.text(TYPE.button, "muted", "left", pad, ROWS_Y + labels.length * ROW_GAP + 6)

    const g = SPACING.popupButtonGap
    const bw = (this.w - pad * 2 - g) / 2
    const by = this.h - pad - BUTTON_H
    this.yes = this.button("Yes, record", pad + bw / 2, by + BUTTON_H / 2, bw, () => {
      if (this.connected) this.onYes()
    })
    this.no = this.button("Not now", pad + bw + g + bw / 2, by + BUTTON_H / 2, bw, () => this.onNo())
    this.no.rect.backgroundColor = themeColor("panel")
    this.no.rect.borderColor = themeColor("ink")
    this.no.text.textFill.color = themeColor("ink")

    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** The camera the pop-up opens in front of. */
  setup(camera: SceneObject) {
    this.camera = camera
  }

  render(look: LookbackView | null) {
    const record = look && look.screen === "J" ? look.record : null
    const show = !!record && !!look && !!this.camera
    if (show && !this.open) this.openInFront()
    this.open = show
    this.sceneObject.enabled = show
    if (!show || !record || !look) return
    this.connected = look.phoneConnected
    const key = `${look.section}|${record.speed}|${record.mirror}|${look.phoneConnected}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.values[0].text = String(look.section)
    this.values[1].text = `${record.speed}× · ${record.mirror ? "ON" : "OFF"}`
    this.values[2].text = look.phoneConnected ? "CONNECTED ✓" : "NOT CONNECTED"
    this.hint.text = look.phoneConnected ? "" : NOT_CONNECTED
    this.yes.rect.backgroundColor = themeColor(look.phoneConnected ? "active" : "panel")
    this.yes.rect.borderColor = themeColor(look.phoneConnected ? "active" : "ghostLine")
    this.yes.text.textFill.color = themeColor(look.phoneConnected ? "activeInk" : "soft")
  }

  private openInFront() {
    this.lastKey = ""
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

  /** Puts the pop-up RECORD_POPUP.distanceCm out along its yaw from the anchor, a little below eye level, facing you. */
  private place() {
    const yaw = this.follow.yaw
    const dir = new vec3(Math.sin(yaw), 0, Math.cos(yaw))
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(this.anchor.add(dir.uniformScale(RECORD_POPUP.distanceCm)).add(new vec3(0, -RECORD_POPUP.dropCm, 0)))
    t.setLocalScale(new vec3(RECORD_POPUP.scale, RECORD_POPUP.scale, RECORD_POPUP.scale))
    t.setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }

  /** The way you're facing, as a yaw about the vertical. */
  private headYaw(): number {
    const look = this.camera!.getTransform().back
    return Math.atan2(look.x, look.z)
  }

  /** A pressable button centred at (x, y) px from the card's top-left. */
  private button(label: string, x: number, y: number, w: number, onPress: () => void): Button {
    const object = childObject(label, this.card)
    object.getTransform().setLocalPosition(this.point(x, y, Z_ITEM))
    const rect = makeRect(object, "active", ORDER + 1)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("active")
    setRectSize(rect, w, BUTTON_H, RADII.popupButton)
    const labelObject = childObject("Label", object)
    labelObject.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
    const text = makeText(labelObject, TYPE.popupButton, "activeInk", ORDER + 2)
    text.text = label

    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(w), pxToCm(BUTTON_H), HIT_DEPTH)
    collider.shape = shape
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(onPress)
    return { object, rect, text }
  }

  /** A line of text anchored at (x, y) px from the card's top-left. */
  private text(sizePx: number, token: ColorToken, align: "left" | "right", xPx: number, yPx: number): Text {
    const so = childObject("Text", this.card)
    so.getTransform().setLocalPosition(this.point(xPx, yPx, Z_ITEM))
    return makeText(so, sizePx, token, ORDER + 2, align)
  }

  /** (x, y) px from the card's top-left (y down, as in the prototype) → cm from its centre. */
  private point(xPx: number, yPx: number, z: number): vec3 {
    return new vec3(pxToCm(xPx - this.w / 2), -pxToCm(yPx - this.h / 2), z)
  }
}
