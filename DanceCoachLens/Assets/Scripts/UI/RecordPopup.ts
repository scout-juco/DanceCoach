/**
 * RecordPopup: the "Record lookback?" dialog (screen J, B2LookArmed).
 *
 * Title, body, four key/value rows (Section, Speed · mirror, Phone camera, You're in frame) and "Yes, record" (pink) over
 * "Not now". "Yes, record" is greyed out and does nothing until the phone is connected; the body then says to open /record on
 * the phone. "You're in frame" shows the phone's connection, as there is no in-frame detection.
 * Fill #23262B, 1 px border, radius 24, padding 32. It isn't on the video board: like Routine done it opens in front of your head
 * (Layout.RECORD_POPUP, a little farther out and scaled down) and glides back in front of you if you turn more than
 * POPUP.followDeg away (PopupFollow).
 * A shallow view: render() shows the Lookback view while it's on J.
 */
import { speedMirrorLabel } from "../Core/DialogCopy"
import { LookbackView } from "../Core/LookbackController"
import { DialogButton, makeDialogButton } from "./DialogButton"
import { pxToCm, RECORD_POPUP, SCREENS } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { ColorToken, RADIUS, SPACE, TextStyle } from "./Theme"
import { childObject, Icon, makeIcon, makeSurface, makeText } from "./Visuals"

// Layers in front of the card, in cm: its text and buttons, then their labels.
const Z_ITEM = 0.1
// Drawn after the video board, which sits behind it.
const ORDER = 10

const PAD = 32
const BODY = "Your recording will use the same settings as your\ncurrent section. Would you like to continue?"
const NOT_CONNECTED = "Not connected: open /record on your phone"
// From the card's top (px): the title 32, the body 48, four 24 rows 8 apart, the buttons 56, each block 16 apart.
const TITLE_Y = PAD
const BODY_Y = TITLE_Y + 32 + SPACE.attached
const ROWS_Y = BODY_Y + 48 + SPACE.attached
const ROW_H = 24
const BUTTON_Y = ROWS_Y + 4 * ROW_H + 3 * SPACE.group + SPACE.attached
const BUTTON_H = 56
// The values on the right: Inter 700 14/20.
const VALUE_STYLE: TextStyle = { family: "inter", size: 14, lineHeight: 20, weight: 700 }
const TICK = 12

@component
export class RecordPopup extends BaseScriptComponent {
  /** Called when "Yes, record" is pinched. */
  onYes: () => void = () => {}
  /** Called when "Not now" is pinched. */
  onNo: () => void = () => {}

  private camera: SceneObject | null = null
  private card: SceneObject
  private body: Text
  private values: Text[] = []
  private ticks: Icon[] = []
  private yes: DialogButton
  private follow = new PopupFollow()
  // Where the pop-up is measured from: your head when it opened, gliding after you when it follows.
  private anchor = vec3.zero()
  private open = false
  private connected = false
  private lastKey = ""
  private readonly w = SCREENS.J.popup![2]
  private readonly h = SCREENS.J.popup![3]

  onAwake() {
    this.card = childObject("Card", this.sceneObject)
    makeSurface(this.card, { fill: "panelSolid", border: "border", borderPx: 1, radius: RADIUS.lg }, ORDER, this.w, this.h)

    this.text("heading", "text", "left", PAD, TITLE_Y + 16).text = "Record lookback?"
    this.body = this.text("body", "textMuted", "left", PAD, BODY_Y + 24)
    const labels = ["Section", "Speed · mirror", "Phone camera", "You're in frame"]
    labels.forEach((label, i) => {
      const y = ROWS_Y + i * (ROW_H + SPACE.group) + ROW_H / 2
      this.text("body", "textMuted", "left", PAD, y).text = label
      this.values.push(this.text(VALUE_STYLE, "text", "right", this.w - PAD, y))
    })
    // A tick after "CONNECTED" and alone for "You're in frame": the glyph isn't in the fonts, so it's drawn.
    for (const i of [2, 3]) {
      const y = ROWS_Y + i * (ROW_H + SPACE.group) + ROW_H / 2
      const tick = makeIcon(this.card, "check", "text", ORDER + 2, TICK)
      tick.object.getTransform().setLocalPosition(this.point(this.w - PAD - TICK / 2, y, Z_ITEM))
      this.ticks.push(tick)
    }

    const g = SPACE.between
    const bw = (this.w - PAD * 2 - g) / 2
    const by = BUTTON_Y + BUTTON_H / 2
    this.yes = makeDialogButton(this.card, this.w, this.h, {
      label: "Yes, record",
      x: PAD + bw / 2,
      y: by,
      w: bw,
      h: BUTTON_H,
      radius: RADIUS.pill,
      fill: "pink",
      ink: "onColor",
      style: "buttonStrong",
      order: ORDER + 1,
      onPress: () => {
        if (this.connected) this.onYes()
      },
    })
    makeDialogButton(this.card, this.w, this.h, {
      label: "Not now",
      x: PAD + bw + g + bw / 2,
      y: by,
      w: bw,
      h: BUTTON_H,
      radius: RADIUS.pill,
      fill: "control",
      ink: "text",
      style: "button",
      order: ORDER + 1,
      onPress: () => this.onNo(),
    })

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
    const on = look.phoneConnected
    this.body.text = on ? BODY : NOT_CONNECTED
    this.values[0].text = String(look.section)
    this.values[1].text = speedMirrorLabel(record.speed, record.mirror)
    // "CONNECTED" and its tick; the tick sits at the right edge, so the word moves in by its width and a gap.
    this.values[2].text = on ? "CONNECTED" : "NOT CONNECTED"
    this.values[2].getSceneObject().getParent().getTransform().setLocalPosition(this.point(this.w - PAD - (on ? TICK + SPACE.group : 0), ROWS_Y + 2 * (ROW_H + SPACE.group) + ROW_H / 2, Z_ITEM))
    this.values[3].text = on ? "" : "—"
    this.ticks[0].object.enabled = on
    this.ticks[1].object.enabled = on
    const fill: ColorToken = on ? "pink" : "control"
    this.yes.setLook(fill, on ? "onColor" : "textDisabled")
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

  /** A line of text anchored at (x, y centre) px from the card's top-left. */
  private text(style: Parameters<typeof makeText>[1], token: ColorToken, align: "left" | "right", xPx: number, yPx: number): Text {
    const so = childObject("Text", this.card)
    so.getTransform().setLocalPosition(this.point(xPx, yPx, Z_ITEM))
    return makeText(so, style, token, ORDER + 2, align)
  }

  /** (x, y) px from the card's top-left (y down, as in the prototype) → cm from its centre. */
  private point(xPx: number, yPx: number, z: number): vec3 {
    return new vec3(pxToCm(xPx - this.w / 2), -pxToCm(yPx - this.h / 2), z)
  }
}
