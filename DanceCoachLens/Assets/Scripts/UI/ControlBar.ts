/**
 * ControlBar: the Playthrough controls on Clip ended.
 *
 * Mode button (Playthrough · NEXT: POSE), Replay section, From the top, speed (0.5× / 0.75× / 1×),
 * Mirror and Counts. A pinch on a control calls onPress with its command.
 * A shallow view: render() shows the view state, placed by the screen's controls panel
 * in Layout.SCREENS. It's hidden on screens without one, so it can't be pressed mid-run.
 * The bar sizes itself to its controls, so the panel's width is ignored.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { MODES, Speed, ViewState } from "../Core/PlaybackController"
import { panelsFor, pointInPanelCm, pxToCm, PxRect, SCREENS } from "./Layout"
import { ColorToken, RADII, SPACING, TYPE } from "./Theme"
import { childObject, makeRect, makeText, makeTopIcon, place, setRectSize, themeColor } from "./Visuals"

// Layers in front of the window plane, in cm: the bar, its controls, then their labels.
const Z_BAR = 0.1
const Z_CONTROL = 0.2
const Z_LABEL = 0.05
// Collider depth, in cm.
const HIT_DEPTH = 1
const SPEEDS: Speed[] = [0.5, 0.75, 1]

export type ControlCommand = "mode" | "replay" | "top" | "mirror" | "counts" | Speed

interface Control {
  object: SceneObject
  rect: RoundedRectangle
}

@component
export class ControlBar extends BaseScriptComponent {
  /** Called when a control is pinched. */
  onPress: (command: ControlCommand) => void = () => {}

  private bar: RoundedRectangle
  private barObject: SceneObject
  private mode: Control
  private modeName: Text
  private modeNext: Text
  private modeDots: RoundedRectangle[] = []
  private replay: Control
  private top: Control
  private speedBox: Control
  private speeds: { control: Control; text: Text }[] = []
  private toggles: { control: Control; name: Text; state: Text }[] = []
  private screen = ""
  private lastKey = ""

  onAwake() {
    this.barObject = childObject("Bar", this.sceneObject)
    this.bar = makeRect(this.barObject, "panel", 1)
    this.bar.border = true
    this.bar.borderSize = pxToCm(1)
    this.bar.borderColor = themeColor("stroke")

    const H = this.itemHeight()
    const c = SPACING.control

    this.mode = this.control("Mode", c.mode, H, "mode")
    this.mode.rect.borderColor = themeColor("ink")
    this.modeName = this.label(this.mode.object, TYPE.modeName, "ink", 12 - c.mode / 2, -9, "left")
    this.modeNext = this.label(this.mode.object, TYPE.modeNext, "muted", 50 - c.mode / 2, 11, "left")
    for (let i = 0; i < MODES.length; i++) {
      const dot = childObject(`Dot${i}`, this.mode.object)
      const rect = makeRect(dot, "panel", 3)
      rect.border = true
      rect.borderSize = pxToCm(1.2)
      rect.borderColor = themeColor("ink")
      setRectSize(rect, SPACING.modeDot, SPACING.modeDot, SPACING.modeDot / 2)
      dot.getTransform().setLocalPosition(new vec3(pxToCm(16 + i * SPACING.modeDotGap - c.mode / 2), -pxToCm(11), Z_LABEL))
      this.modeDots.push(rect)
    }

    this.replay = this.control("Replay", c.replay, H, "replay")
    this.replay.rect.backgroundColor = themeColor("active")
    this.replay.rect.borderColor = themeColor("active")
    this.label(this.replay.object, TYPE.icon, "activeInk", 0, -8).text = "↺"
    this.label(this.replay.object, TYPE.button, "activeInk", 0, 14).text = "Replay section"

    this.top = this.control("FromTheTop", c.top, H, "top")
    const icon = childObject("Icon", this.top.object)
    icon.getTransform().setLocalPosition(new vec3(pxToCm(72.5 - c.top / 2), pxToCm(8), Z_LABEL))
    makeTopIcon(icon, "ink", 4, 39)
    this.label(this.top.object, TYPE.button, "ink", 0, 14).text = "From the top"

    // The speed box is a frame; each speed is its own segment inside it.
    this.speedBox = this.control("Speed", c.speed, H, null)
    const segW = c.speed / SPEEDS.length
    SPEEDS.forEach((speed, i) => {
      const control = this.control(`Speed ${speed}`, segW, H, speed, this.speedBox.object)
      control.rect.border = false
      control.object.getTransform().setLocalPosition(new vec3(pxToCm((i + 0.5) * segW - c.speed / 2), 0, Z_LABEL))
      const text = this.label(control.object, TYPE.button, "ink", 0, 0)
      text.text = `${speed}×`
      this.speeds.push({ control, text })
    })

    for (const id of ["mirror", "counts"] as const) {
      const control = this.control(id === "mirror" ? "Mirror" : "Counts", c.toggle, H, id)
      const name = this.label(control.object, TYPE.chip, "ink", 0, -8)
      name.text = id === "mirror" ? "Mirror" : "Counts"
      const state = this.label(control.object, TYPE.chip, "ink", 0, 8)
      this.toggles.push({ control, name, state })
    }
    this.sceneObject.enabled = false
  }

  render(view: ViewState) {
    const box = panelsFor(view).controls
    this.sceneObject.enabled = !!box
    if (!box) {
      this.screen = ""
      return
    }
    if (view.screen !== this.screen) {
      this.screen = view.screen
      this.layout(box)
    }
    const st = view.settings
    const key = `${view.mode}|${st.speed}|${st.mirror}|${st.counts}`
    if (key === this.lastKey) return
    this.lastKey = key

    const m = MODES.indexOf(view.mode)
    this.modeName.text = `↻ ${view.mode}`
    this.modeNext.text = `NEXT: ${MODES[(m + 1) % MODES.length].toUpperCase()}`
    this.modeDots.forEach((dot, i) => (dot.backgroundColor = themeColor(i === m ? "ink" : "panel")))

    this.speeds.forEach(({ control, text }, i) => {
      const on = SPEEDS[i] === st.speed
      control.rect.backgroundColor = themeColor(on ? "active" : "panel")
      text.textFill.color = themeColor(on ? "activeInk" : "ink")
    })

    this.toggles.forEach(({ control, state }, i) => {
      const on = i === 0 ? st.mirror : st.counts
      control.rect.backgroundColor = themeColor(on ? "on" : "panel")
      control.rect.borderColor = themeColor(on ? "ink" : "soft")
      state.text = on ? "on" : "off"
      state.textFill.color = themeColor(on ? "ink" : "muted")
    })
  }

  /** Sizes the bar to its controls and lays them out left to right from the panel's top-left. */
  private layout(box: PxRect) {
    const H = this.itemHeight()
    const pad = SPACING.barPad
    const items = [this.mode, this.replay, this.top, this.speedBox, ...this.toggles.map((t) => t.control)]
    const widths = [SPACING.control.mode, SPACING.control.replay, SPACING.control.top, SPACING.control.speed, SPACING.control.toggle, SPACING.control.toggle]
    const w = 2 * pad + widths.reduce((a, b) => a + b, 0) + SPACING.controlGap * (items.length - 1)
    const h = box[3]
    place(this.barObject, pointInPanelCm(box, w / 2, h / 2), Z_BAR)
    setRectSize(this.bar, w, h, RADII.bar)
    let x = pad
    items.forEach((item, i) => {
      place(item.object, pointInPanelCm(box, x + widths[i] / 2, pad + H / 2), Z_CONTROL)
      x += widths[i] + SPACING.controlGap
    })
  }

  private itemHeight(): number {
    // Every screen with controls uses the same bar height.
    return SCREENS.C.controls![3] - 2 * SPACING.barPad
  }

  /** A rounded control with a border, pressable when it has a command. */
  private control(name: string, wPx: number, hPx: number, command: ControlCommand | null, parent = this.sceneObject): Control {
    const object = childObject(name, parent)
    const rect = makeRect(object, "panel", 2)
    rect.border = true
    rect.borderSize = pxToCm(1)
    rect.borderColor = themeColor("soft")
    setRectSize(rect, wPx, hPx, RADII.control)
    if (command !== null) {
      const collider = object.createComponent("ColliderComponent") as ColliderComponent
      collider.fitVisual = false
      const shape = Shape.createBoxShape()
      shape.size = new vec3(pxToCm(wPx), pxToCm(hPx), HIT_DEPTH)
      collider.shape = shape
      const interactable = object.createComponent(Interactable.getTypeName()) as Interactable
      interactable.onTriggerEnd.add(() => this.onPress(command))
    }
    return { object, rect }
  }

  /** A line of text at (x, y) px from its control's centre (y down, as in the prototype). */
  private label(parent: SceneObject, sizePx: number, token: ColorToken, xPx: number, yPx: number, align: "left" | "center" = "center"): Text {
    const so = childObject("Label", parent)
    so.getTransform().setLocalPosition(new vec3(pxToCm(xPx), -pxToCm(yPx), Z_LABEL))
    return makeText(so, sizePx, token, 4, align)
  }
}
