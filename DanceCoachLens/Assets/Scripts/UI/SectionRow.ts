/**
 * SectionRow: the Full, 1, 2, … N tiles under the video on Clip ended.
 *
 * Sized to the dance's number of sections. The current section is highlighted and
 * sections you've danced show a tick. A pinch on a tile calls onTap with the section
 * number, or "full".
 * A shallow view: render() shows the view state, placed by the screen's sections panel
 * in Layout.SCREENS. It's hidden on screens without one, so it can't be pressed mid-run.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ViewState } from "../Core/PlaybackController"
import { pointInPanelCm, pxToCm, SCREENS } from "./Layout"
import { ColorToken, RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, place, setRectSize, themeColor } from "./Visuals"

const Z = 0.1
// Collider depth, in cm.
const HIT_DEPTH = 1

export type SectionTap = number | "full"

interface Tile {
  id: SectionTap
  object: SceneObject
  rect: RoundedRectangle
  text: Text
  collider: ColliderComponent
}

@component
export class SectionRow extends BaseScriptComponent {
  /** Called when a tile is pinched. */
  onTap: (id: SectionTap) => void = () => {}

  private tiles: Tile[] = []
  private lastKey = ""

  onAwake() {
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const box = SCREENS[view.screen].sections
    this.sceneObject.enabled = !!box
    if (!box) return
    if (this.tiles.length !== view.sectionCount + 1) this.build(view.sectionCount)
    const key = `${view.screen}|${view.section}|${view.runKind}|${view.doneSections.join(",")}`
    if (key === this.lastKey) return
    this.lastKey = key

    const n = this.tiles.length
    const tw = (box[2] - SPACING.tileGap * (n - 1)) / n
    const th = box[3]
    this.tiles.forEach((tile, i) => {
      place(tile.object, pointInPanelCm(box, i * (tw + SPACING.tileGap) + tw / 2, th / 2), Z)
      setRectSize(tile.rect, tw, th, RADII.tile)
      const shape = Shape.createBoxShape()
      shape.size = new vec3(pxToCm(tw), pxToCm(th), HIT_DEPTH)
      tile.collider.shape = shape

      const current = tile.id === "full" ? view.runKind === "full" : view.runKind !== "full" && tile.id === view.section
      const done = typeof tile.id === "number" && !current && view.doneSections.indexOf(tile.id) >= 0
      const bg: ColorToken = current ? "active" : done || tile.id === "full" ? "done" : "panel"
      tile.rect.backgroundColor = themeColor(bg)
      tile.rect.borderColor = themeColor(current ? "active" : "soft")
      tile.text.textFill.color = themeColor(current ? "activeInk" : "ink")
      const label = tile.id === "full" ? "Full" : String(tile.id)
      tile.text.text = done ? `${label} ✓` : label
    })
  }

  private build(sectionCount: number) {
    this.tiles.forEach((t) => t.object.destroy())
    this.tiles = []
    const ids: SectionTap[] = ["full"]
    for (let i = 1; i <= sectionCount; i++) ids.push(i)
    for (const id of ids) {
      const object = childObject(`Tile ${id}`, this.sceneObject)
      const rect = makeRect(object, "panel", 1)
      rect.border = true
      rect.borderSize = pxToCm(1)
      const textObject = childObject("Label", object)
      textObject.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
      const text = makeText(textObject, TYPE.tile, "ink", 2)
      const collider = object.createComponent("ColliderComponent") as ColliderComponent
      collider.fitVisual = false
      const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
      interactable.onTriggerEnd.add(() => this.onTap(id))
      this.tiles.push({ id, object, rect, text, collider })
    }
    this.lastKey = ""
  }
}
