/**
 * SectionRow: the Full, 1, 2, … N tiles under the video on Clip ended.
 *
 * Sized to the dance's number of sections, right-aligned to the video, 8 apart (BUILD_SPEC §6.7): 56-tall pills,
 * the current one volt with dark text, done ones "n ✓" in muted text with a border, the rest white with a border.
 * A pinch on a tile calls onTap with the section number, or "full".
 * In Pose and Lookback (a section is picked to look at, not run) there's no hold-for-range, and only Lookback has a Full tile (the routine's takes; Pose has none): the tiles keep
 * Clip ended's width, right-aligned, and the current one is the mode's own section (render's second argument), volt, or pink in Lookback.
 * A shallow view: render() shows the view state, placed by the screen's sections panel
 * in Layout.SCREENS. It's hidden on screens without one, so it can't be pressed mid-run.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { SectionTap, ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm } from "./Layout"
import { ColorToken, RADIUS, SPACE } from "./Theme"
import { addHover, childObject, Icon, makeIcon, makePill, makeText, place, setRectSize, setSurfaceBorder, themeColor } from "./Visuals"

const Z = 0.1
// Collider depth, in cm.
const HIT_DEPTH = 1
// How long a tile is held before it starts a range selection, in seconds.
const HOLD_SEC = 0.6
// A done tile's "n ✓": the tick is drawn (the fonts have no ✓), this big, with the pair centred on the tile.
const TICK = { size: 14, shift: 7 }

interface Tile {
  id: SectionTap
  object: SceneObject
  rect: RoundedRectangle
  label: SceneObject
  text: Text
  tick: Icon
  collider: ColliderComponent
}

@component
export class SectionRow extends BaseScriptComponent {
  /** Called when a tile is pinched. */
  onTap: (id: SectionTap) => void = () => {}
  /** Called when a selected range of sections is pinched to play, first through last. */
  onRange: (first: number, last: number) => void = () => {}

  private tiles: Tile[] = []
  private lastKey = ""
  private lastView: ViewState | null = null
  // Pose or Lookback's section while one of them is open, else null.
  private inMode: number | null = null
  // The range being selected after a long press (0 when not selecting). Always contiguous.
  private selFirst = 0
  private selLast = 0
  // The tile being held and how long it has been, or null.
  private holding: Tile | null = null
  private heldSec = 0

  onAwake() {
    this.sceneObject.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.updateHold())
  }

  render(view: ViewState, inMode: number | null = null) {
    this.lastView = view
    this.inMode = inMode
    const box = panelsFor(view).sections
    this.sceneObject.enabled = !!box
    if (!box) {
      this.clearSelection()
      return
    }
    const picking = this.inMode !== null
    if (this.tiles.length !== view.sectionCount + 1) this.build(view.sectionCount)
    const key = `${view.screen}|${this.inMode}|${view.section}|${view.runStop}|${view.runKind}|${view.doneSections.join(",")}|${this.selFirst}-${this.selLast}`
    if (key === this.lastKey) return
    this.lastKey = key

    const n = this.tiles.length
    const tw = (box[2] - SPACE.group * (n - 1)) / n
    const th = box[3]
    // Pose has no Full tile: the others keep their width, right-aligned, and the left slot stays empty. Lookback has Full (its tile is the routine's takes).
    const noFull = picking && view.mode === "Pose"
    const first = noFull ? 1 : 0
    const x0 = noFull ? tw + SPACE.group : 0
    this.tiles.forEach((tile, i) => {
      tile.object.enabled = i >= first
      place(tile.object, pointInPanelCm(box, x0 + (i - first) * (tw + SPACE.group) + tw / 2, th / 2), Z)
      setRectSize(tile.rect, tw, th, RADIUS.pill)
      const shape = Shape.createBoxShape()
      shape.size = new vec3(pxToCm(tw), pxToCm(th), HIT_DEPTH)
      tile.collider.shape = shape

      const selecting = this.selFirst > 0
      const inRange = (n: number) => selecting ? n >= this.selFirst && n <= this.selLast : view.runKind === "section" && n >= view.section && n <= view.runStop
      let current: boolean
      if (picking) current = tile.id === (this.inMode === 0 ? "full" : this.inMode)
      else if (tile.id === "full") current = !selecting && view.runKind === "full"
      else if (selecting || view.runKind === "section") current = inRange(tile.id)
      else current = view.runKind === "top" && tile.id === view.section
      const done = typeof tile.id === "number" && !current && view.doneSections.indexOf(tile.id) >= 0
      tile.rect.backgroundColor = themeColor(current ? (view.mode === "Lookback" ? "pink" : "volt") : "panel")
      setSurfaceBorder(tile.rect, current ? null : "border", 1)
      const ink: ColorToken = current ? "onColor" : done ? "textMuted" : "text"
      tile.text.textFill.color = themeColor(ink)
      tile.text.text = tile.id === "full" ? "Full" : String(tile.id)
      tile.label.getTransform().setLocalPosition(new vec3(pxToCm(done ? -TICK.shift : 0), 0, 0.05))
      tile.tick.object.enabled = done
      tile.tick.setColor(ink)
    })
  }

  private build(sectionCount: number) {
    this.tiles.forEach((t) => t.object.destroy())
    this.tiles = []
    const ids: SectionTap[] = ["full"]
    for (let i = 1; i <= sectionCount; i++) ids.push(i)
    for (const id of ids) {
      const object = childObject(`Tile ${id}`, this.sceneObject)
      const rect = makePill(object, "panel", 1, 92, 56, "border")
      const textObject = childObject("Label", object)
      textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
      const text = makeText(textObject, "buttonStrong", "text", 2)
      const tick = makeIcon(object, "check", "textMuted", 2, TICK.size)
      tick.object.getTransform().setLocalPosition(new vec3(pxToCm(TICK.shift + 2), 0, 0.05))
      const collider = object.createComponent("ColliderComponent") as ColliderComponent
      collider.fitVisual = false
      const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
      addHover(object, rect)
      const tile: Tile = { id, object, rect, label: textObject, text, tick, collider }
      interactable.onTriggerStart.add(() => {
        this.holding = tile
        this.heldSec = 0
      })
      interactable.onTriggerCanceled.add(() => {
        if (this.holding === tile) this.holding = null
      })
      interactable.onTriggerEnd.add(() => {
        // A hold that started a selection has already been handled.
        if (this.holding !== tile) return
        this.holding = null
        this.tap(id)
      })
      this.tiles.push(tile)
    }
    this.lastKey = ""
  }

  /** A held tile starts a range at that section. */
  private updateHold() {
    const tile = this.holding
    if (!tile || typeof tile.id !== "number" || this.inMode !== null) return
    this.heldSec += getDeltaTime()
    if (this.heldSec < HOLD_SEC) return
    this.holding = null
    this.selFirst = this.selLast = tile.id
    this.refresh()
  }

  /**
   * A pinch on a tile. While selecting: a tile outside the range stretches it to that tile
   * (filling the gap, so it stays contiguous), a tile inside it plays it; Full cancels.
   */
  private tap(id: SectionTap) {
    if (this.selFirst === 0) return this.onTap(id)
    if (id === "full") {
      this.clearSelection()
      return this.refresh()
    }
    if (id >= this.selFirst && id <= this.selLast) {
      const first = this.selFirst
      const last = this.selLast
      this.clearSelection()
      return first === last ? this.onTap(first) : this.onRange(first, last)
    }
    // Outside the range: stretch to it, taking in the sections in between.
    if (id < this.selFirst) this.selFirst = id
    else this.selLast = id
    this.refresh()
  }

  private clearSelection() {
    this.selFirst = this.selLast = 0
    this.holding = null
  }

  private refresh() {
    this.lastKey = ""
    if (this.lastView) this.render(this.lastView)
  }
}
