/** The component kit (BUILD_SPEC section 6): small DOM builders, styled by theme.css. */
import { ICON_PATHS, type IconName } from "./icons"
import { STATUS_LABEL } from "./linkState"

type Attrs = Record<string, string>

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  node.append(...children)
  return node
}

/** Drawn at 20 (16 inside chips). Decorative: the button around it carries the label. */
export function icon(name: IconName, size = 20): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", String(size))
  svg.setAttribute("height", String(size))
  svg.setAttribute("aria-hidden", "true")
  svg.classList.add("icon")
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", ICON_PATHS[name])
  path.setAttribute("fill", "none")
  path.setAttribute("stroke", "currentColor")
  path.setAttribute("stroke-width", "2")
  path.setAttribute("stroke-linecap", "round")
  path.setAttribute("stroke-linejoin", "round")
  svg.append(path)
  return svg
}

export type ButtonKind = "primary" | "secondary" | "ghost"
export interface ButtonOptions { kind?: ButtonKind; height?: 44 | 48 | 56; small?: boolean; icon?: IconName; disabled?: boolean; onClick?: () => void }

export function button(label: string, o: ButtonOptions = {}): HTMLButtonElement {
  const b = el("button", `btn ${o.kind ?? "primary"}${o.height === 48 ? " h48" : o.height === 44 ? " h44" : ""}${o.small ? " small" : ""}`, { type: "button" })
  if (o.icon) b.append(icon(o.icon))
  b.append(label)
  b.disabled = !!o.disabled
  if (o.onClick) b.addEventListener("click", o.onClick)
  return b
}

/** A circle with an icon. The label is required: it is the only thing a screen reader gets. */
export function iconButton(name: IconName, label: string, o: { size?: 40 | 44; fill?: "control" | "scrim" | "white"; onClick?: () => void } = {}): HTMLButtonElement {
  const b = el("button", `icon-btn${o.size === 40 ? " small" : ""}${o.fill === "scrim" ? " scrim" : o.fill === "white" ? " white" : ""}`, { type: "button", "aria-label": label })
  if (o.fill === "white") b.style.color = "var(--on-volt)"
  b.append(icon(name))
  if (o.onClick) b.addEventListener("click", o.onClick)
  return b
}

export interface ChipOptions { kind?: "default" | "overlay" | "pink"; height?: 24 | 28 | 32; dot?: boolean }

export function chip(label: string, o: ChipOptions = {}): HTMLElement {
  const c = el("span", `chip${o.kind === "overlay" ? " overlay" : o.kind === "pink" ? " pink" : ""}${o.height === 24 ? " h24" : o.height === 28 ? " h28" : ""}`)
  if (o.dot) c.append(el("span", "dot on", { "aria-hidden": "true" }))
  c.append(label)
  return c
}

/** The status chip: lime dot and the connected wording, or a grey dot and "Not connected". One wording constant for every screen. */
export function statusChip(connected: boolean, onTap?: () => void): HTMLElement {
  const label = connected ? STATUS_LABEL.connected : STATUS_LABEL["not-connected"]
  const c = el(onTap ? "button" : "span", `chip status${onTap ? " tappable" : ""}`, onTap ? { type: "button" } : {}, el("span", `dot${connected ? " on" : ""}`, { "aria-hidden": "true" }), label)
  if (onTap) c.addEventListener("click", onTap)
  return c
}

/** Updates a status chip made by statusChip in place. */
export function setStatusChip(chipEl: HTMLElement, connected: boolean) {
  chipEl.querySelector(".dot")?.classList.toggle("on", connected)
  chipEl.lastChild!.textContent = connected ? STATUS_LABEL.connected : STATUS_LABEL["not-connected"]
}

export function segmented(label: string, items: string[], selected: number, onChange: (i: number) => void): HTMLElement {
  const track = el("div", "segmented", { role: "tablist", "aria-label": label })
  const buttons = items.map((text, i) => {
    const b = el("button", "", { type: "button", role: "tab", "aria-selected": String(i === selected) }, text)
    b.addEventListener("click", () => {
      buttons.forEach((o, j) => o.setAttribute("aria-selected", String(i === j)))
      onChange(i)
    })
    return b
  })
  track.append(...buttons)
  return track
}

/** Segmented bar, one segment per section. Never a percentage: the words are the text equivalent. */
export function sectionsBar(learned: number, total: number): HTMLElement {
  const bar = el("div", "sections-bar", { role: "img", "aria-label": `${learned} of ${total} sections learned` })
  for (let i = 0; i < total; i++) bar.append(el("span", i < learned ? "learned" : ""))
  return bar
}

export function sectionsLearnedText(learned: number, total: number): string {
  return `${learned}/${total} sections learned`
}

export function backHeader(title: string, onBack: () => void): HTMLElement {
  return el("div", "back-header", {}, iconButton("back", "Back", { onClick: onBack }), el("h1", "title", {}, title))
}

/** Placeholder gradient; with a src it is the video's first frame, cover-cropped. */
export function thumbnail(width: number, height: number, src?: string, radius?: number): HTMLElement {
  const t = el("div", "thumb")
  t.style.width = `${width}px`
  t.style.height = `${height}px`
  if (radius !== undefined) t.style.borderRadius = `${radius}px`
  if (src) t.append(el("img", "", { src, alt: "" }))
  return t
}

export interface InputOptions { id: string; label: string; placeholder?: string; type?: string; inputMode?: string; maxLength?: number; pattern?: string; autocomplete?: string; className?: string }

/** Label above (Sora 700 14, 8 gap) and a 56 tall pill. */
export function input(o: InputOptions): { field: HTMLElement; input: HTMLInputElement } {
  const i = el("input", `input${o.className ? " " + o.className : ""}`, { id: o.id, type: o.type ?? "text", autocomplete: o.autocomplete ?? "off" })
  if (o.placeholder) i.placeholder = o.placeholder
  if (o.inputMode) i.inputMode = o.inputMode as HTMLInputElement["inputMode"]
  if (o.maxLength) i.maxLength = o.maxLength
  if (o.pattern) i.pattern = o.pattern
  return { field: el("div", "field", {}, el("label", "", { for: o.id }, o.label), i), input: i }
}

/** A bottom sheet over a scrim. Tapping the scrim closes it. Returns a close function. */
export function sheet(content: Node[], onClose?: () => void): { root: HTMLElement; close: () => void } {
  const body = el("div", "sheet", { role: "dialog", "aria-modal": "true" }, ...content)
  const root = el("div", "sheet-backdrop", {}, body)
  const close = () => {
    root.remove()
    onClose?.()
  }
  root.addEventListener("click", (e) => {
    if (e.target === root) close()
  })
  document.body.append(root)
  return { root, close }
}
