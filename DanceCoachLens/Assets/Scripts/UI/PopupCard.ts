/**
 * PopupCard: the Routine done dialog (screen G, B2Finish).
 *
 * An eyebrow ("FROM THE TOP · SECTION 1 → SECTION 4 · 1×"), "That's the whole routine.", a pill per section with its tick,
 * the volt "Record your dance" card (which only toasts that it's coming soon), then Run it again · Keep practicing · Back to dances.
 * Fill #23262B, 1 px border, radius 24, padding 32.
 * It isn't on the video board: it opens in front of your head (Layout.POPUP) and glides
 * back in front of you if you turn more than POPUP.followDeg away (PopupFollow). The toast sits under it, as part of it.
 * A shallow view: render() shows it while the view state has the pop-up; setup() gives it the camera.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { routineDoneEyebrow } from "../Core/DialogCopy"
import { RoutineDoneChoice, ViewState } from "../Core/PlaybackController"
import { makeDialogButton } from "./DialogButton"
import { POPUP, pxToCm, SCREENS } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { RADIUS, SPACE, TextStyle } from "./Theme"
import { childObject, Icon, makeIcon, makePill, makeSurface, makeText } from "./Visuals"

// Layers in front of the card, in cm: its pills and buttons, then their labels.
const Z_ITEM = 0.1
const Z_LABEL = 0.05
// Drawn after the video board, which sits behind it.
const ORDER = 10

const PAD = 32
// From the card's top (px): eyebrow 16, title 48, pills 32, the card button 80, the buttons 56, each 16 apart.
const EYEBROW_Y = PAD
const TITLE_Y = EYEBROW_Y + 16 + SPACE.attached
const PILLS_Y = TITLE_Y + 48 + SPACE.attached
const RECORD_Y = PILLS_Y + 32 + SPACE.attached
const BUTTONS_Y = RECORD_Y + 80 + SPACE.attached
const PILL_H = 32
// "Record your dance" is Sora 800 20/28, sitting above an empty 20-high caption line, bottom-aligned: its centre is 42 down the card.
const RECORD_STYLE: TextStyle = { family: "sora", size: 20, lineHeight: 28, weight: 800 }
const RECORD_LABEL_DY = 2
// A digit in Sora 700 14 is about this wide (px), for centring a number with its tick.
const NUMBER_W = 9
const TOAST_W = 420
const TOAST_H = 48

const BUTTONS: { choice: RoutineDoneChoice; label: string }[] = [
  { choice: "again", label: "Run it again" },
  { choice: "practice", label: "Keep practicing" },
  { choice: "back", label: "Back to dances" },
]

interface Tile {
  object: SceneObject
  rect: RoundedRectangle
  text: Text
  labelObject: SceneObject
  tick: Icon
}

@component
export class PopupCard extends BaseScriptComponent {
  /** Called when a choice is pinched. */
  onChoose: (choice: RoutineDoneChoice) => void = () => {}

  private camera: SceneObject | null = null
  private card: SceneObject
  private eyebrow: Text
  private tiles: Tile[] = []
  private toastObject: SceneObject
  private toastText: Text
  private follow = new PopupFollow()
  // Where the pop-up is measured from: your head when it opened, gliding after you when it follows.
  private anchor = vec3.zero()
  private open = false
  private tilesKey = ""
  private readonly w = SCREENS.G.popup![2]
  private readonly h = SCREENS.G.popup![3]

  onAwake() {
    this.card = childObject("Card", this.sceneObject)
    makeSurface(this.card, { fill: "panelSolid", border: "border", borderPx: 1, radius: RADIUS.lg }, ORDER, this.w, this.h)

    this.eyebrow = this.text("eyebrow", "textMuted", PAD, EYEBROW_Y + 8)
    this.text("titleXl", "text", PAD, TITLE_Y + 24).text = "That's the whole routine."

    const inner = this.w - PAD * 2
    makeDialogButton(this.card, this.w, this.h, {
      label: "Record your dance",
      x: PAD + inner / 2,
      y: RECORD_Y + 40,
      w: inner,
      h: 80,
      radius: RADIUS.lg,
      fill: "volt",
      ink: "onColor",
      style: RECORD_STYLE,
      order: ORDER + 1,
      labelDy: RECORD_LABEL_DY,
      onPress: () => this.onChoose("record"),
    })

    const g = SPACE.between
    const bw = (inner - g * (BUTTONS.length - 1)) / BUTTONS.length
    BUTTONS.forEach((b, i) => {
      makeDialogButton(this.card, this.w, this.h, {
        label: b.label,
        x: PAD + i * (bw + g) + bw / 2,
        y: BUTTONS_Y + 28,
        w: bw,
        h: 56,
        radius: RADIUS.pill,
        fill: "control",
        ink: "text",
        style: "button",
        order: ORDER + 1,
        onPress: () => this.onChoose(b.choice),
      })
    })

    // The toast: a scrim pill 16 under the card.
    this.toastObject = childObject("Toast", this.sceneObject)
    this.toastObject.getTransform().setLocalPosition(new vec3(0, -pxToCm(this.h / 2 + SPACE.attached + TOAST_H / 2), Z_ITEM))
    makePill(this.toastObject, "scrim", ORDER + 3, TOAST_W, TOAST_H)
    const toastLabel = childObject("Label", this.toastObject)
    toastLabel.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
    this.toastText = makeText(toastLabel, "chip", "text", ORDER + 4)
    this.toastObject.enabled = false

    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** The camera the pop-up opens in front of. */
  setup(camera: SceneObject) {
    this.camera = camera
  }

  render(view: ViewState) {
    const show = view.popup === "routineDone" && !!this.camera
    if (show && !this.open) this.openInFront()
    this.open = show
    this.sceneObject.enabled = show
    if (!show) return
    const eyebrow = routineDoneEyebrow(view)
    const key = `${eyebrow}|${view.sectionCount}|${view.doneSections.join(",")}`
    if (key !== this.tilesKey) {
      this.tilesKey = key
      this.eyebrow.text = eyebrow
      this.renderTiles(view)
    }
    this.toastObject.enabled = !!view.toast
    if (view.toast) this.toastText.text = view.toast
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

  /** Puts the pop-up POPUP.distanceCm out along its yaw from the anchor, a little below eye level, facing you. */
  private place() {
    const yaw = this.follow.yaw
    const dir = new vec3(Math.sin(yaw), 0, Math.cos(yaw))
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(this.anchor.add(dir.uniformScale(POPUP.distanceCm)).add(new vec3(0, -POPUP.dropCm, 0)))
    t.setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }

  /** The way you're facing, as a yaw about the vertical. */
  private headYaw(): number {
    const look = this.camera!.getTransform().back
    return Math.atan2(look.x, look.z)
  }

  /** One pill per section across the card; "n ✓" (tick in volt) for the sections you've danced. */
  private renderTiles(view: ViewState) {
    const n = view.sectionCount
    const gap = SPACE.group
    const tw = (this.w - PAD * 2 - gap * (n - 1)) / n
    while (this.tiles.length < n) {
      const object = childObject(`Tile${this.tiles.length + 1}`, this.card)
      const rect = makePill(object, "control", ORDER + 1, tw, PILL_H)
      const labelObject = childObject("Label", object)
      const text = makeText(labelObject, "chip", "text", ORDER + 2)
      const tick = makeIcon(object, "check", "volt", ORDER + 2, 12)
      this.tiles.push({ object, rect, text, labelObject, tick })
    }
    this.tiles.forEach((tile, i) => {
      tile.object.enabled = i < n
      if (i >= n) return
      const done = view.doneSections.indexOf(i + 1) >= 0
      tile.object.getTransform().setLocalPosition(this.point(PAD + i * (tw + gap) + tw / 2, PILLS_Y + PILL_H / 2, Z_ITEM))
      tile.rect.size = new vec2(pxToCm(tw), pxToCm(PILL_H))
      tile.rect.cornerRadius = pxToCm(PILL_H / 2)
      tile.text.text = String(i + 1)
      tile.tick.object.enabled = done
      // The number and its tick, centred together (the tick is 12 wide, 4 after the number).
      const numberW = NUMBER_W * String(i + 1).length
      const groupW = done ? numberW + 4 + 12 : numberW
      tile.labelObject.getTransform().setLocalPosition(new vec3(pxToCm(-groupW / 2 + numberW / 2), 0, Z_LABEL))
      tile.tick.object.getTransform().setLocalPosition(new vec3(pxToCm(groupW / 2 - 6), 0, Z_LABEL))
    })
  }

  /** A line of left-aligned text at (x, y centre) px from the card's top-left. */
  private text(style: "eyebrow" | "titleXl", token: "text" | "textMuted", xPx: number, yPx: number): Text {
    const so = childObject("Text", this.card)
    so.getTransform().setLocalPosition(this.point(xPx, yPx, Z_ITEM))
    return makeText(so, style, token, ORDER + 2, "left")
  }

  /** (x, y) px from the card's top-left (y down, as in the prototype) → cm from its centre. */
  private point(xPx: number, yPx: number, z: number): vec3 {
    return new vec3(pxToCm(xPx - this.w / 2), -pxToCm(yPx - this.h / 2), z)
  }
}
