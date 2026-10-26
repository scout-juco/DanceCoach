/**
 * PopupCard: the Routine done pop-up (screen G).
 *
 * "That's the whole routine.", the sections with their ticks, and three choices:
 * Run it again, Keep practicing and Back. A pinch on one calls onChoose with it.
 * It isn't on the video board: it opens in front of your head (Layout.POPUP) and glides
 * back in front of you if you turn more than POPUP.followDeg away (PopupFollow).
 * A shallow view: render() shows it while the view state has the pop-up; setup() gives it the camera.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { RoutineDoneChoice, ViewState } from "../Core/PlaybackController"
import { POPUP, pxToCm, SCREENS } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { ColorToken, RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, setRectSize, themeColor } from "./Visuals"

// Layers in front of the card, in cm: its tiles and buttons, then their labels.
const Z_ITEM = 0.1
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
// Drawn after the video board, which sits behind it.
const ORDER = 10

const BUTTONS: { choice: RoutineDoneChoice; label: string; fill: ColorToken; border: ColorToken; ink: ColorToken }[] = [
  { choice: "again", label: "Run it again", fill: "active", border: "active", ink: "activeInk" },
  { choice: "practice", label: "Keep practicing", fill: "panel", border: "ink", ink: "ink" },
  { choice: "back", label: "Back", fill: "panel", border: "soft", ink: "ink" },
]

@component
export class PopupCard extends BaseScriptComponent {
  /** Called when a choice is pinched. */
  onChoose: (choice: RoutineDoneChoice) => void = () => {}

  private camera: SceneObject | null = null
  private card: SceneObject
  private head: Text
  private tiles: { object: SceneObject; rect: RoundedRectangle; text: Text }[] = []
  private follow = new PopupFollow()
  // Where the pop-up is measured from: your head when it opened, gliding after you when it follows.
  private anchor = vec3.zero()
  private open = false
  private tilesKey = ""
  private readonly w = SCREENS.G.popup![2]
  private readonly h = SCREENS.G.popup![3]

  onAwake() {
    const pad = SPACING.popupPad
    this.card = childObject("Card", this.sceneObject)
    const bg = makeRect(this.card, "panel", ORDER)
    bg.border = true
    bg.borderSize = pxToCm(1)
    bg.borderColor = themeColor("stroke")
    setRectSize(bg, this.w, this.h, RADII.popup)

    this.head = this.text(TYPE.popupHead, "ink2", pad, pad + 8)
    this.text(TYPE.popupTitle, "ink", pad, pad + SPACING.popupTitleY).text = "That's the whole routine."

    const g = SPACING.popupButtonGap
    const bw = (this.w - pad * 2 - g * (BUTTONS.length - 1)) / BUTTONS.length
    const bh = SPACING.popupButtonHeight
    BUTTONS.forEach((b, i) => {
      const object = childObject(b.label, this.card)
      object.getTransform().setLocalPosition(this.point(pad + i * (bw + g) + bw / 2, pad + SPACING.popupButtonsY + bh / 2, Z_ITEM))
      const rect = makeRect(object, b.fill, ORDER + 1)
      rect.border = true
      rect.borderSize = pxToCm(1)
      rect.borderColor = themeColor(b.border)
      setRectSize(rect, bw, bh, RADII.popupButton)
      const label = childObject("Label", object)
      label.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
      makeText(label, TYPE.popupButton, b.ink, ORDER + 2).text = b.label

      const collider = object.createComponent("ColliderComponent") as ColliderComponent
      collider.fitVisual = false
      const shape = Shape.createBoxShape()
      shape.size = new vec3(pxToCm(bw), pxToCm(bh), HIT_DEPTH)
      collider.shape = shape
      const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
      interactable.onTriggerEnd.add(() => this.onChoose(b.choice))
    })

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
    const key = `${view.sectionCount}|${view.doneSections.join(",")}`
    if (key !== this.tilesKey) {
      this.tilesKey = key
      this.head.text = `ROUTINE DONE · ${view.sectionCount} SECTIONS`
      this.renderTiles(view)
    }
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

  /** One tile per section across the card, filled and ticked for the sections you've danced. */
  private renderTiles(view: ViewState) {
    const pad = SPACING.popupPad
    const n = view.sectionCount
    const gap = SPACING.tileGap
    const tw = (this.w - pad * 2 - gap * (n - 1)) / n
    const th = SPACING.popupTileHeight
    while (this.tiles.length < n) {
      const object = childObject(`Tile${this.tiles.length + 1}`, this.card)
      const rect = makeRect(object, "panel", ORDER + 1)
      rect.border = true
      rect.borderSize = pxToCm(1)
      const label = childObject("Label", object)
      label.getTransform().setLocalPosition(new vec3(0, 0, Z_LABEL))
      this.tiles.push({ object, rect, text: makeText(label, TYPE.popupTile, "ink", ORDER + 2) })
    }
    this.tiles.forEach((tile, i) => {
      tile.object.enabled = i < n
      if (i >= n) return
      const done = view.doneSections.indexOf(i + 1) >= 0
      tile.object.getTransform().setLocalPosition(this.point(pad + i * (tw + gap) + tw / 2, pad + SPACING.popupTilesY + th / 2, Z_ITEM))
      setRectSize(tile.rect, tw, th, RADII.popupTile)
      tile.rect.backgroundColor = themeColor(done ? "active" : "panel")
      tile.rect.borderColor = themeColor(done ? "active" : "soft")
      tile.text.text = done ? `${i + 1} ✓` : `${i + 1}`
      tile.text.textFill.color = themeColor(done ? "activeInk" : "ink")
    })
  }

  /** A line of left-aligned text at (x, y) px from the card's top-left. */
  private text(sizePx: number, token: ColorToken, xPx: number, yPx: number): Text {
    const so = childObject("Text", this.card)
    so.getTransform().setLocalPosition(this.point(xPx, yPx, Z_ITEM))
    return makeText(so, sizePx, token, ORDER + 2, "left")
  }

  /** (x, y) px from the card's top-left (y down, as in the prototype) → cm from its centre. */
  private point(xPx: number, yPx: number, z: number): vec3 {
    return new vec3(pxToCm(xPx - this.w / 2), -pxToCm(yPx - this.h / 2), z)
  }
}
