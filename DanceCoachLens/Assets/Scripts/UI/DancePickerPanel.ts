/**
 * DancePickerPanel: the "Pick a dance" card (wireframe A), shown before the count-in and again
 * from the "Dances" button.
 *
 * A heading with "PINCH A TILE TO START", a line saying what's going on (loading, the offline
 * fallback, could not load), a grid of dance tiles (a thumbnail block with the difficulty on it,
 * then the title) and, when they apply, "Try again" and "Back to list" buttons.
 * Like the Routine done pop-up it isn't on the video board: it opens in front of your head
 * (Layout.PICKER) and glides back in front of you if you turn away (PopupFollow).
 * A shallow view: render() shows a PickerView (null hides it); the picker's rules are in
 * Core/DancePicker. A pinch on a tile calls onPick, on a button onRetry or onList.
 * The card is a fixed 3:4 portrait (480×640 px), narrow enough for the glasses' field of view.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { PickerView } from "../Core/DancePicker"
import { PICKER, pxToCm } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { ColorToken, RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, setRectSize, themeColor } from "./Visuals"

// Layers in front of the card, in cm, one step per nesting level.
const Z_STEP = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
// Drawn after the video board, which sits behind it.
const ORDER = 10

// The card, in prototype px: 3:4 portrait so it fits the glasses' field of view, 2 tiles across, up to 3 rows.
const W = 480
const H = 640
const PAD = 24
const COLUMNS = 2
const MAX_DANCES = 6
const GAP = 16
const TILE_W = (W - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS
const TILE_H = 160
const TILE_PAD = 10
const THUMB_H = 104
const STATUS_Y = 78
const GRID_Y = 110
const BUTTON_H = 44
const PILL_W = 150
const PILL_H = 22
const DOT = 8
// The loading bar, under the status line.
const BAR_Y = 150
const BAR_H = 14
const BAR_W = W - PAD * 2

/** Beginner, Intermediate, Advanced → 1–3 dots; any other difficulty has none. */
const LEVELS: Record<string, number> = { beginner: 1, easy: 1, intermediate: 2, medium: 2, advanced: 3, hard: 3 }

interface Button {
  object: SceneObject
  text: Text
}

interface Tile {
  object: SceneObject
  title: Text
  pill: SceneObject
  pillText: Text
  dots: { object: SceneObject; rect: RoundedRectangle }[]
}

@component
export class DancePickerPanel extends BaseScriptComponent {
  /** Called with a dance's id when its tile is pinched. */
  onPick: (id: string) => void = () => {}
  onRetry: () => void = () => {}
  onList: () => void = () => {}

  private camera: SceneObject | null = null
  private card: SceneObject
  private bg: RoundedRectangle
  private status: Text
  private barTrack: SceneObject
  private barFill: RoundedRectangle
  private tiles: Tile[] = []
  private retry: Button
  private list: Button
  private ids: string[] = []
  private follow = new PopupFollow()
  // Where the card is measured from: your head when it opened, gliding after you when it follows.
  private anchor = vec3.zero()
  private open = false
  private key = ""

  onAwake() {
    this.card = childObject("Card", this.sceneObject)
    // On its own object: it's centred on that, while the rest of the card is laid out from the top edge.
    this.bg = makeRect(childObject("Background", this.card), "panel", ORDER)
    this.bg.border = true
    this.bg.borderSize = pxToCm(1)
    this.bg.borderColor = themeColor("stroke")

    this.text(TYPE.pickerTitle, "ink", "left", PAD, PAD + 16).text = "Pick a dance"
    // Right-aligned in the wireframe; centred on where its right end goes.
    this.text(TYPE.popupHead, "ink2", "center", W - PAD - 80, PAD + 20).text = "PINCH A TILE TO START"
    this.status = this.text(TYPE.popupHead, "ink2", "left", PAD, STATUS_Y)

    this.makeBar()
    for (let i = 0; i < MAX_DANCES; i++) this.tiles.push(this.makeTile(i))
    const bw = (W - PAD * 2 - SPACING.popupButtonGap) / 2
    this.retry = this.makeButton("Retry", "active", "active", "activeInk", bw)
    this.list = this.makeButton("List", "panel", "soft", "ink", bw)
    this.list.text.text = "Back to list"
    this.setSize()

    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** The camera the card opens in front of. */
  setup(camera: SceneObject) {
    this.camera = camera
  }

  render(view: PickerView | null) {
    const show = !!view && !!this.camera
    if (show && !this.open) this.openInFront()
    this.open = show
    this.sceneObject.enabled = show
    if (!view) {
      this.key = ""
      return
    }
    const key = JSON.stringify(view)
    if (key === this.key) return
    this.key = key

    const dances = view.kind === "list" ? view.dances.slice(0, MAX_DANCES) : []
    this.ids = dances.map((d) => d.id)
    this.status.text = this.statusLine(view)
    this.tiles.forEach((tile, i) => {
      const dance = dances[i]
      tile.object.enabled = !!dance
      if (!dance) return
      const x = PAD + (i % COLUMNS) * (TILE_W + GAP)
      const ty = GRID_Y + Math.floor(i / COLUMNS) * (TILE_H + GAP)
      tile.object.getTransform().setLocalPosition(this.point(x + TILE_W / 2, ty + TILE_H / 2, Z_STEP))
      tile.title.text = dance.title
      const level = LEVELS[(dance.difficulty ?? "").toLowerCase()] ?? 0
      tile.pill.enabled = !!dance.difficulty
      tile.pillText.text = (dance.difficulty ?? "").toUpperCase()
      tile.dots.forEach((dot, d) => {
        dot.object.enabled = level > 0
        dot.rect.backgroundColor = themeColor(d < level ? "ink" : "soft")
      })
    })
    // Buttons along the bottom edge, only where they apply (never with a full grid of tiles).
    const y = H - PAD - BUTTON_H
    const failed = view.kind === "failed"
    const offline = view.kind === "list" && view.offline
    this.retry.object.enabled = failed || offline
    const loadingDance = view.kind === "loadingDance"
    this.list.object.enabled = failed || loadingDance
    this.list.text.text = loadingDance ? "Back" : "Back to list"
    this.barTrack.enabled = loadingDance
    if (view.kind === "loadingDance") this.showProgress(view.progress)
    this.retry.text.text = failed ? "Try again" : "Try the server again"
    const bw = (W - PAD * 2 - SPACING.popupButtonGap) / 2
    this.retry.object.getTransform().setLocalPosition(this.point(PAD + bw / 2, y + BUTTON_H / 2, Z_STEP))
    // Beside Try again on a failure; on its own, centred, while a dance loads.
    const listX = loadingDance ? W / 2 : PAD + bw + SPACING.popupButtonGap + bw / 2
    this.list.object.getTransform().setLocalPosition(this.point(listX, y + BUTTON_H / 2, Z_STEP))
  }

  private statusLine(view: PickerView): string {
    switch (view.kind) {
      case "loadingList":
        return "Loading dances…"
      case "loadingDance":
        return `Loading ${view.title}… ${Math.round(view.progress * 100)}%`
      case "failed":
        return `Couldn't load ${view.title}.\nCheck the connection and try again.`
      case "list":
        if (view.offline) return "OFFLINE · can't reach the dance server,\nso this is the built-in test dance."
        return view.dances.length === 0 ? "No dances are ready yet.\nMake one ready on the adjust page." : ""
    }
  }

  /** The loading bar: a track across the card with a fill laid over it from the left. */
  private makeBar() {
    this.barTrack = childObject("LoadingBar", this.card)
    this.barTrack.getTransform().setLocalPosition(this.point(W / 2, BAR_Y, Z_STEP))
    setRectSize(makeRect(this.barTrack, "soft", ORDER + 1), BAR_W, BAR_H, BAR_H / 2)
    const fill = childObject("Fill", this.barTrack)
    this.barFill = makeRect(fill, "active", ORDER + 2)
    this.barTrack.enabled = false
  }

  /** Fills the bar to a fraction (0 to 1), growing from its left end. */
  private showProgress(fraction: number) {
    const w = Math.max(BAR_H, BAR_W * Math.min(Math.max(fraction, 0), 1))
    setRectSize(this.barFill, w, BAR_H, BAR_H / 2)
    this.barFill.getSceneObject().getTransform().setLocalPosition(new vec3(pxToCm((w - BAR_W) / 2), 0, Z_STEP))
  }

  /** Sizes the card, and centres it on its spot. */
  private setSize() {
    setRectSize(this.bg, W, H, RADII.popup)
    // The card's origin is its top edge; the rect is centred on its own object.
    this.bg.getSceneObject().getTransform().setLocalPosition(new vec3(0, -pxToCm(H / 2), 0))
    this.card.getTransform().setLocalPosition(new vec3(0, pxToCm(H / 2), 0))
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

  /** Puts the card PICKER.distanceCm out along its yaw from the anchor, a little below eye level, facing you. */
  private place() {
    const yaw = this.follow.yaw
    const dir = new vec3(Math.sin(yaw), 0, Math.cos(yaw))
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(this.anchor.add(dir.uniformScale(PICKER.distanceCm)).add(new vec3(0, -PICKER.dropCm, 0)))
    t.setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }

  /** The way you're facing, as a yaw about the vertical. */
  private headYaw(): number {
    const look = this.camera!.getTransform().back
    return Math.atan2(look.x, look.z)
  }

  /** A dance tile: a thumbnail block with the difficulty pill on it, then the title. */
  private makeTile(index: number): Tile {
    const object = childObject(`Dance${index + 1}`, this.card)
    const rect = makeRect(object, "panel", ORDER + 1)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("soft")
    setRectSize(rect, TILE_W, TILE_H, RADII.tile + 4)

    const thumbW = TILE_W - TILE_PAD * 2
    const thumb = childObject("Thumbnail", object)
    thumb.getTransform().setLocalPosition(new vec3(0, pxToCm(TILE_H / 2 - TILE_PAD - THUMB_H / 2), Z_STEP))
    setRectSize(makeRect(thumb, "video", ORDER + 2), thumbW, THUMB_H, RADII.popupTile)

    // The pill sits in the thumbnail's top-left corner, 8 px in.
    const pill = childObject("Pill", thumb)
    pill.getTransform().setLocalPosition(new vec3(pxToCm(-thumbW / 2 + 8 + PILL_W / 2), pxToCm(THUMB_H / 2 - 8 - PILL_H / 2), Z_STEP))
    setRectSize(makeRect(pill, "panel", ORDER + 3), PILL_W, PILL_H, PILL_H / 2)
    const dots = [0, 1, 2].map((d) => {
      const o = childObject(`Dot${d + 1}`, pill)
      o.getTransform().setLocalPosition(new vec3(pxToCm(-PILL_W / 2 + 14 + d * (DOT + 3)), 0, Z_STEP))
      const dot = makeRect(o, "ink", ORDER + 4)
      setRectSize(dot, DOT, DOT, DOT / 2)
      return { object: o, rect: dot }
    })
    const pillLabel = childObject("Label", pill)
    pillLabel.getTransform().setLocalPosition(new vec3(pxToCm(-PILL_W / 2 + 14 + 3 * (DOT + 3) + 2), 0, Z_STEP))
    const pillText = makeText(pillLabel, TYPE.pickerPill, "ink", ORDER + 4, "left")

    const titleObject = childObject("Title", object)
    titleObject.getTransform().setLocalPosition(new vec3(pxToCm(-TILE_W / 2 + TILE_PAD + 2), pxToCm(-TILE_H / 2 + TILE_PAD + 14), Z_STEP))
    const title = makeText(titleObject, TYPE.pickerTile, "ink", ORDER + 2, "left")

    this.makePinchable(object, TILE_W, TILE_H, () => {
      if (this.ids[index]) this.onPick(this.ids[index])
    })
    object.enabled = false
    return { object, title, pill, pillText, dots }
  }

  /** A button as wide as given; its place is set when it's shown. */
  private makeButton(name: string, fill: ColorToken, border: ColorToken, ink: ColorToken, wPx: number): Button {
    const object = childObject(name, this.card)
    const rect = makeRect(object, fill, ORDER + 1)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor(border)
    setRectSize(rect, wPx, BUTTON_H, RADII.popupButton)
    const label = childObject("Label", object)
    label.getTransform().setLocalPosition(new vec3(0, 0, Z_STEP))
    const text = makeText(label, TYPE.popupButton, ink, ORDER + 2)
    this.makePinchable(object, wPx, BUTTON_H, () => (name === "Retry" ? this.onRetry() : this.onList()))
    object.enabled = false
    return { object, text }
  }

  private makePinchable(object: SceneObject, wPx: number, hPx: number, onPress: () => void) {
    const collider = object.createComponent("ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    const shape = Shape.createBoxShape()
    shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
    collider.shape = shape
    const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(onPress)
  }

  /** A line of text anchored at (x, y) px from the card's top-left. */
  private text(sizePx: number, token: ColorToken, align: "left" | "center", xPx: number, yPx: number): Text {
    const so = childObject("Text", this.card)
    so.getTransform().setLocalPosition(this.point(xPx, yPx, Z_STEP))
    return makeText(so, sizePx, token, ORDER + 2, align)
  }

  /** (x, y) px from the card's top-left (y down, as in the prototype) → cm from its top-centre. */
  private point(xPx: number, yPx: number, z: number): vec3 {
    return new vec3(pxToCm(xPx - W / 2), -pxToCm(yPx), z)
  }
}
