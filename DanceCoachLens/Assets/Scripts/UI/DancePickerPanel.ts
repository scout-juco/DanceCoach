/**
 * DancePickerPanel: the "Pick a dance" panel (B2 screen A), shown before the count-in and again
 * from the "Dances" button.
 *
 * One 840-wide panel: "Pick a dance", the filter pills (All, Easy, Medium, Hard; the chosen one white)
 * and a 3-column grid of dance cards. A card has a thumbnail with "●●○ MEDIUM", the title,
 * "[LENGTH] · N sections" and a status pill: New, volt "n/N sections learned" (the card gets a 2 px white
 * border) or "N/N sections learned ✓". A line says what's going on while the list or a dance loads, the offline
 * fallback, or could not load, and "Try again" / "Back to list" buttons appear where they apply.
 * Like the Routine done pop-up it isn't on the video board: it opens in front of your head
 * (Layout.PICKER) and glides back in front of you if you turn away (PopupFollow).
 * A shallow view: render() shows a PickerView (null hides it); the picker's rules are in Core/DancePicker and
 * what a card says is in Core/DanceCards. A pinch on a card calls onPick, on a button onRetry or onList.
 * The grid shows up to six dances (two rows), after the filter.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { danceStatus, detailsText, Filter, FILTERS, filterDances, levelLabel, levelOf, statusText } from "../Core/DanceCards"
import { PickerView } from "../Core/DancePicker"
import { PICKER, pxToCm } from "./Layout"
import { PopupFollow } from "./PopupFollow"
import { ColorToken, RADIUS, SIZE, SPACE } from "./Theme"
import { childObject, makeIcon, makePill, makeSurface, makeText, setRectSize, setSurfaceBorder, themeColor, Icon } from "./Visuals"

// Layers in front of the panel, in cm, one step per nesting level.
const Z_STEP = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
// Drawn after the video board, which sits behind it.
const ORDER = 10

// The panel, in prototype px (layout.json screen A).
const W = 840
const PAD = SPACE.surface
const HEAD_H = 48
const HEAD_GAP = 20
const COLUMNS = 3
const ROWS = 2
const MAX_DANCES = COLUMNS * ROWS
const GAP = 16
const CARD_W = (W - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS
const CARD_PAD = 12
const THUMB_H = 128
const CARD_GAP = 8
const TITLE_H = 24
const DETAIL_H = 20
const CARD_H = CARD_PAD + THUMB_H + CARD_GAP + TITLE_H + CARD_GAP + DETAIL_H + CARD_GAP + SIZE.chip + CARD_PAD
const GRID_Y = PAD + HEAD_H + HEAD_GAP
const H = GRID_Y + ROWS * CARD_H + (ROWS - 1) * GAP + PAD
// The loading bar, under the status line, which sits under the heading.
const STATUS_Y = GRID_Y + 12
const BAR_Y = GRID_Y + 72
const BAR_H = 14
const BAR_W = W - PAD * 2
const BUTTON_H = 48
const DOT = 8
const DOT_GAP = 4
// Text widths aren't measured: this is a good-enough width per character of Sora's chip and button styles.
const CHIP_CHAR = 10
const FILTER_CHAR = 10

interface Button {
  object: SceneObject
  text: Text
}

interface FilterPill {
  object: SceneObject
  filter: Filter
  selected: SceneObject
  idle: SceneObject
}

interface Card {
  object: SceneObject
  border: RoundedRectangle
  title: Text
  details: Text
  level: SceneObject
  levelPill: RoundedRectangle
  levelText: Text
  dots: { object: SceneObject; rect: RoundedRectangle }[]
  status: SceneObject
  statusPill: RoundedRectangle
  statusText: Text
  statusTick: Icon
}

@component
export class DancePickerPanel extends BaseScriptComponent {
  /** Called with a dance's id when its card is pinched. */
  onPick: (id: string) => void = () => {}
  onRetry: () => void = () => {}
  onList: () => void = () => {}
  /** A dance's saved done sections, for its card's status. */
  progressFor: (id: string) => number[] = () => []

  private camera: SceneObject | null = null
  private card: SceneObject
  private bg: RoundedRectangle
  private status: Text
  private barTrack: SceneObject
  private barFill: RoundedRectangle
  private filterRow: FilterPill[] = []
  private cards: Card[] = []
  private retry: Button
  private list: Button
  private ids: string[] = []
  private filter: Filter = "All"
  private lastView: PickerView | null = null
  private follow = new PopupFollow()
  // Where the panel is measured from: your head when it opened, gliding after you when it follows.
  private anchor = vec3.zero()
  private open = false
  private key = ""

  onAwake() {
    this.card = childObject("Card", this.sceneObject)
    // On its own object: it's centred on that, while the rest of the panel is laid out from the top edge.
    this.bg = makeSurface(childObject("Background", this.card), { fill: "panelSolid", border: "border", radius: RADIUS.lg }, ORDER, W, H)
    this.bg.getSceneObject().getTransform().setLocalPosition(new vec3(0, -pxToCm(H / 2), 0))
    this.card.getTransform().setLocalPosition(new vec3(0, pxToCm(H / 2), 0))

    this.text("heading", "text", "left", PAD, PAD + HEAD_H / 2).text = "Pick a dance"
    this.makeFilters()
    this.status = this.text("body", "textMuted", "left", PAD, STATUS_Y)

    this.makeBar()
    for (let i = 0; i < MAX_DANCES; i++) this.cards.push(this.makeCard(i))
    const bw = (W - PAD * 2 - SPACE.between) / 2
    this.retry = this.makeButton("Retry", "volt", "onColor", bw)
    this.list = this.makeButton("List", "control", "text", bw)

    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** The camera the panel opens in front of. */
  setup(camera: SceneObject) {
    this.camera = camera
  }

  render(view: PickerView | null) {
    const show = !!view && !!this.camera
    if (show && !this.open) this.openInFront()
    this.open = show
    this.sceneObject.enabled = show
    this.lastView = view
    if (!view) {
      this.key = ""
      return
    }
    const listed = view.kind === "list" ? filterDances(view.dances, this.filter).slice(0, MAX_DANCES) : []
    const done = listed.map((d) => this.progressFor(d.id))
    const key = JSON.stringify([view, this.filter, done])
    if (key === this.key) return
    this.key = key

    this.ids = listed.map((d) => d.id)
    this.filterRow.forEach((p) => {
      const on = p.filter === this.filter
      p.selected.enabled = on
      p.idle.enabled = !on
      p.object.enabled = view.kind === "list"
    })
    this.status.text = this.statusLine(view, listed.length)
    this.cards.forEach((card, i) => {
      const dance = listed[i]
      card.object.enabled = !!dance
      if (!dance) return
      const x = PAD + (i % COLUMNS) * (CARD_W + GAP)
      const y = GRID_Y + Math.floor(i / COLUMNS) * (CARD_H + GAP)
      card.object.getTransform().setLocalPosition(this.point(x + CARD_W / 2, y + CARD_H / 2, Z_STEP))
      card.title.text = dance.title
      card.details.text = detailsText(dance)
      this.showLevel(card, dance.difficulty)
      const status = danceStatus(done[i], dance.sections ?? 0)
      // The dance you're in the middle of has a white 2 px border.
      setSurfaceBorder(card.border, status.kind === "inProgress" ? "text" : "border", status.kind === "inProgress" ? 2 : 1)
      this.showStatus(card, status.kind, statusText(status))
    })
    // Buttons along the bottom edge, only where they apply (never with a full grid of cards).
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
    const bw = (W - PAD * 2 - SPACE.between) / 2
    this.retry.object.getTransform().setLocalPosition(this.point(PAD + bw / 2, y + BUTTON_H / 2, Z_STEP))
    // Beside Try again on a failure; on its own, centred, while a dance loads.
    const listX = loadingDance ? W / 2 : PAD + bw + SPACE.between + bw / 2
    this.list.object.getTransform().setLocalPosition(this.point(listX, y + BUTTON_H / 2, Z_STEP))
  }

  private statusLine(view: PickerView, shown: number): string {
    switch (view.kind) {
      case "loadingList":
        return "Loading dances…"
      case "loadingDance":
        return `Loading ${view.title}… ${Math.round(view.progress * 100)}%`
      case "failed":
        return `Couldn't load ${view.title}.\nCheck the connection and try again.`
      case "list":
        if (view.offline) return "OFFLINE · can't reach the dance server,\nso this is the built-in test dance."
        if (view.dances.length === 0) return "No dances are ready yet.\nMake one ready on the adjust page."
        return shown === 0 ? `No ${this.filter.toLowerCase()} dances yet.` : ""
    }
  }

  /** The thumbnail's "●●○ MEDIUM" pill, sized to its text; hidden for a dance with no difficulty. */
  private showLevel(card: Card, difficulty?: string) {
    const label = levelLabel(difficulty)
    card.level.enabled = !!label
    if (!label) return
    const name = difficulty!.toUpperCase()
    const level = levelOf(difficulty)
    const dotsW = 3 * DOT + 2 * DOT_GAP
    const w = 16 + dotsW + SPACE.group + name.length * CHIP_CHAR + 16
    setRectSize(card.levelPill, w, SIZE.chip, RADIUS.pill)
    // Pivot on the pill's left edge, so the pill grows right.
    card.level.getTransform().setLocalPosition(this.cardPoint(CARD_PAD + SPACE.group + w / 2, CARD_PAD + SPACE.group + SIZE.chip / 2))
    card.dots.forEach((dot, d) => {
      dot.object.getTransform().setLocalPosition(new vec3(pxToCm(-w / 2 + 16 + DOT / 2 + d * (DOT + DOT_GAP)), 0, Z_STEP))
      dot.rect.backgroundColor = themeColor(d < level ? "text" : "tickOff")
    })
    card.levelText.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(pxToCm(-w / 2 + 16 + dotsW + SPACE.group), 0, Z_STEP))
    card.levelText.text = name
  }

  /** The status pill: volt while in progress, a scrim otherwise; a drawn tick after "learned" when done. */
  private showStatus(card: Card, kind: "new" | "inProgress" | "done", label: string) {
    const text = label.replace(" ✓", "")
    const tick = kind === "done"
    const textW = text.length * CHIP_CHAR * 0.9
    const w = 16 + textW + (tick ? SPACE.group + 12 : 0) + 16
    card.statusPill.backgroundColor = themeColor(kind === "inProgress" ? "volt" : "scrim")
    setRectSize(card.statusPill, w, SIZE.chip, RADIUS.pill)
    card.statusText.textFill.color = themeColor(kind === "inProgress" ? "onColor" : "text")
    card.statusText.text = text
    card.status.getTransform().setLocalPosition(this.cardPoint(CARD_PAD + w / 2, CARD_H - CARD_PAD - SIZE.chip / 2))
    card.statusText.getSceneObject().getParent().getTransform().setLocalPosition(new vec3(pxToCm(-w / 2 + 16), 0, Z_STEP))
    card.statusTick.object.enabled = tick
    card.statusTick.object.getTransform().setLocalPosition(new vec3(pxToCm(-w / 2 + 16 + textW + SPACE.group + 6), 0, Z_STEP))
  }

  /** The loading bar: a track across the panel with a fill laid over it from the left. */
  private makeBar() {
    this.barTrack = childObject("LoadingBar", this.card)
    this.barTrack.getTransform().setLocalPosition(this.point(W / 2, BAR_Y, Z_STEP))
    makePill(this.barTrack, "control", ORDER + 1, BAR_W, BAR_H)
    const fill = childObject("Fill", this.barTrack)
    this.barFill = makePill(fill, "volt", ORDER + 2, BAR_W, BAR_H)
    this.barTrack.enabled = false
  }

  /** Fills the bar to a fraction (0 to 1), growing from its left end. */
  private showProgress(fraction: number) {
    const w = Math.max(BAR_H, BAR_W * Math.min(Math.max(fraction, 0), 1))
    setRectSize(this.barFill, w, BAR_H, BAR_H / 2)
    this.barFill.getSceneObject().getTransform().setLocalPosition(new vec3(pxToCm((w - BAR_W) / 2), 0, Z_STEP))
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

  /** Puts the panel PICKER.distanceCm out along its yaw from the anchor, a little below eye level, facing you. */
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

  /** The four filter pills along the heading's right end: the chosen one white, the others outlined. */
  private makeFilters() {
    const widths = FILTERS.map((f) => 40 + f.length * FILTER_CHAR)
    let right = W - PAD
    for (let i = FILTERS.length - 1; i >= 0; i--) {
      const filter = FILTERS[i]
      const w = widths[i]
      const object = childObject(`Filter${filter}`, this.card)
      object.getTransform().setLocalPosition(this.point(right - w / 2, PAD + HEAD_H / 2, Z_STEP))
      right -= w + SPACE.group

      const selected = childObject("Selected", object)
      makePill(selected, "text", ORDER + 1, w, HEAD_H)
      makeText(childObject("Label", selected), "buttonStrong", "onColor", ORDER + 2).text = filter
      const idle = childObject("Idle", object)
      makePill(idle, null, ORDER + 1, w, HEAD_H, "border")
      makeText(childObject("Label", idle), "button", "text", ORDER + 2).text = filter

      this.makePinchable(object, w, HEAD_H, () => {
        if (this.filter === filter) return
        this.filter = filter
        // Re-render with what's showing, now filtered.
        this.render(this.lastView)
      })
      this.filterRow.push({ object, filter, selected, idle })
    }
  }

  /** A dance card: a thumbnail block with the difficulty pill on it, the title, the details, the status pill. */
  private makeCard(index: number): Card {
    const object = childObject(`Dance${index + 1}`, this.card)
    const border = makeSurface(object, { fill: "track", border: "border", radius: RADIUS.lg }, ORDER + 1, CARD_W, CARD_H)

    const thumb = childObject("Thumbnail", object)
    thumb.getTransform().setLocalPosition(new vec3(0, pxToCm(CARD_H / 2 - CARD_PAD - THUMB_H / 2), Z_STEP))
    makeSurface(thumb, { fill: "control", radius: RADIUS.md }, ORDER + 2, CARD_W - CARD_PAD * 2, THUMB_H)

    // The level pill sits in the thumbnail's top-left corner, 8 px in; showLevel() sizes and places it.
    const level = childObject("Level", object)
    const levelPill = makePill(level, "scrim", ORDER + 3, 100, SIZE.chip)
    const dots = [0, 1, 2].map((d) => {
      const o = childObject(`Dot${d + 1}`, level)
      const rect = makeSurface(o, { fill: "text", radius: DOT / 2 }, ORDER + 4, DOT, DOT)
      return { object: o, rect }
    })
    const levelText = makeText(childObject("Label", level), "chip", "text", ORDER + 4, "left")

    const left = -CARD_W / 2 + CARD_PAD
    const titleObject = childObject("Title", object)
    titleObject.getTransform().setLocalPosition(new vec3(pxToCm(left), pxToCm(CARD_H / 2 - CARD_PAD - THUMB_H - CARD_GAP - TITLE_H / 2), Z_STEP))
    const title = makeText(titleObject, "buttonStrong", "text", ORDER + 2, "left")
    const detailsObject = childObject("Details", object)
    detailsObject.getTransform().setLocalPosition(new vec3(pxToCm(left), pxToCm(CARD_H / 2 - CARD_PAD - THUMB_H - CARD_GAP - TITLE_H - CARD_GAP - DETAIL_H / 2), Z_STEP))
    const details = makeText(detailsObject, "caption", "textMuted", ORDER + 2, "left")

    const status = childObject("Status", object)
    const statusPill = makePill(status, "scrim", ORDER + 3, 100, SIZE.chip)
    const statusText = makeText(childObject("Label", status), "chip", "text", ORDER + 4, "left")
    const statusTick = makeIcon(status, "check", "text", ORDER + 4, 12)

    this.makePinchable(object, CARD_W, CARD_H, () => {
      if (this.ids[index]) this.onPick(this.ids[index])
    })
    object.enabled = false
    return { object, border, title, details, level, levelPill, levelText, dots, status, statusPill, statusText, statusTick }
  }

  /** A button as wide as given; its place is set when it's shown. */
  private makeButton(name: string, fill: ColorToken, ink: ColorToken, wPx: number): Button {
    const object = childObject(name, this.card)
    makePill(object, fill, ORDER + 1, wPx, BUTTON_H)
    const label = childObject("Label", object)
    label.getTransform().setLocalPosition(new vec3(0, 0, Z_STEP))
    const text = makeText(label, "buttonStrong", ink, ORDER + 2)
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

  /** A line of text anchored at (x, y) px from the panel's top-left. */
  private text(style: "heading" | "body", token: ColorToken, align: "left" | "center", xPx: number, yPx: number): Text {
    const so = childObject("Text", this.card)
    so.getTransform().setLocalPosition(this.point(xPx, yPx, Z_STEP))
    return makeText(so, style, token, ORDER + 2, align)
  }

  /** (x, y) px from the panel's top-left (y down, as in the prototype) → cm from its top-centre. */
  private point(xPx: number, yPx: number, z: number): vec3 {
    return new vec3(pxToCm(xPx - W / 2), -pxToCm(yPx), z)
  }

  /** (x, y) px from a card's top-left → cm from its centre. */
  private cardPoint(xPx: number, yPx: number): vec3 {
    return new vec3(pxToCm(xPx - CARD_W / 2), -pxToCm(yPx - CARD_H / 2), Z_STEP)
  }
}
