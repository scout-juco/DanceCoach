/** Pair, the not-connected sheet and the kit page; the Library is in libraryScreen. */
import { backHeader, button, chip, el, icon, iconButton, input, sectionsBar, sectionsLearnedText, segmented, sheet, statusChip, thumbnail } from "./kit"
import { ICON_PATHS, type IconName } from "./icons"
import { cleanCode, pair } from "./pairing"
import type { LinkPoller } from "./linkState"

export interface Screen {
  root: HTMLElement
  /** Called with every link snapshot while the screen is showing. */
  dispose: () => void
}

export interface Ctx {
  link: LinkPoller
  getToken: () => string | null
  setToken: (t: string | null) => void
  go: (hash: string) => void
}

export function pairScreen(ctx: Ctx): Screen {
  const root = el("main", "screen")
  const title = el("h1", "display", {}, "Pair your Specs")
  const helper = el("p", "body-text", {}, "Open Dance Coach on your Specs. Type the 4-digit code it shows.")
  const { field, input: code } = input({ id: "code", label: "Code", placeholder: "0000", type: "text", inputMode: "numeric", maxLength: 4, pattern: "[0-9]*", autocomplete: "one-time-code", className: "code" })
  const error = el("p", "error", { role: "alert", id: "code-error" })
  error.hidden = true
  const pairBtn = button("Pair", { disabled: true })
  const footer = el("div", "footer", {}, pairBtn)
  root.append(title, el("div", "field", {}, helper, field, error), footer)

  const showError = (message: string) => {
    error.textContent = message
    error.hidden = !message
    code.setAttribute("aria-invalid", String(!!message))
    if (message) code.setAttribute("aria-describedby", "code-error")
    else code.removeAttribute("aria-describedby")
  }
  code.addEventListener("input", () => {
    code.value = cleanCode(code.value)
    pairBtn.disabled = code.value.length !== 4
    showError("")
  })
  const submit = async () => {
    if (pairBtn.disabled) return
    pairBtn.disabled = true
    const result = await pair(code.value)
    if (result.ok) {
      ctx.setToken(result.token)
      ctx.go("#/")
      return
    }
    showError(result.error)
    pairBtn.disabled = code.value.length !== 4
  }
  pairBtn.addEventListener("click", submit)
  code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void submit()
  })
  return { root, dispose: () => {} }
}

let openSheet: { close: () => void } | null = null

/** What to do when the Specs are not connected. Closes itself when they come back. */
export function showNotConnected(ctx: Ctx) {
  if (openSheet) return
  let off = () => {}
  const dismiss = () => {
    off()
    openSheet?.close()
    openSheet = null
  }
  const pairAgain = button("Pair again", {
    kind: "secondary",
    onClick: () => {
      dismiss()
      ctx.setToken(null)
      ctx.go("#/pair")
    },
  })
  openSheet = sheet(
    [
      el("h2", "section-heading", {}, "Specs not connected"),
      el("p", "body-text", {}, "Put your Specs on and open Dance Coach. This page reconnects by itself."),
      button("Got it", { onClick: dismiss }),
      pairAgain,
    ],
    () => {
      off()
      openSheet = null
    },
  )
  let first = true
  off = ctx.link.subscribe((s) => {
    if (first) return void (first = false)
    if (s.status === "connected") dismiss()
  })
}

/** Every component once, to check against the renders. */
export function kitScreen(ctx: Ctx): Screen {
  const root = el("main", "screen")
  const group = (name: string, ...children: Node[]) => el("section", "kit-group", {}, el("h2", "caps", {}, name), ...children)
  const row = (...children: Node[]) => el("div", "kit-row", {}, ...children)

  const colors = ["volt", "pink", "room", "panel-solid", "track", "control", "text", "text-muted", "text-subtle", "text-disabled"]
  const swatches = el("div", "swatches", {}, ...colors.map((c) => {
    const s = el("div", "swatch", {}, c)
    s.style.background = `var(--${c})`
    s.style.color = ["volt", "pink", "text", "text-muted", "text-subtle"].includes(c) ? "var(--on-volt)" : "var(--text)"
    return s
  }))

  root.append(
    el("h1", "display", {}, "Kit"),
    group("Colour", swatches),
    group("Type", el("div", "display", {}, "Display 28"), el("div", "title", {}, "Title 24"), el("div", "card-title", {}, "Card title 20"), el("div", "section-heading", {}, "Section heading 18"), el("div", "body-text", {}, "Body 14 · meta line"), el("div", "caps", {}, "Caps label")),
    group("Buttons", button("Primary 56"), button("Primary 48", { height: 48 }), button("Secondary 56", { kind: "secondary" }), button("Secondary with icon", { kind: "secondary", icon: "plus" }), button("Secondary 44 small", { kind: "secondary", height: 44, small: true }), button("Ghost", { kind: "ghost" }), button("Disabled", { disabled: true })),
    group("Icon buttons", row(iconButton("back", "Back"), iconButton("close", "Close", { fill: "scrim" }), iconButton("play", "Watch", { size: 40, fill: "white" }), iconButton("download", "Download", { size: 40 }), iconButton("trash", "Delete", { size: 40 }))),
    group("Chips", row(statusChip(true), statusChip(false)), row(chip("Sec 2", { kind: "overlay" }), chip("Lookback", { kind: "pink" }), chip("0.75×"), chip("LEARNING", { height: 28, dot: true }))),
    group("Segmented control", segmented("Library", ["In progress", "Learned", "Saved"], 0, () => {})),
    group("Sections learned", sectionsBar(1, 4), el("div", "meta", {}, sectionsLearnedText(1, 4))),
    group("Back header", backHeader("Title", () => {})),
    group("Thumbnails", row(thumbnail(96, 168), thumbnail(72, 128), thumbnail(48, 64, undefined, 12), thumbnail(40, 56, undefined, 12))),
    group("Input", input({ id: "kit-input", label: "Paste a link", placeholder: "https://" }).field),
    group("Icons", row(...(Object.keys(ICON_PATHS) as IconName[]).map((n) => icon(n)))),
    group("Sheet", button("Open the not-connected sheet", { kind: "secondary", onClick: () => showNotConnected(ctx) })),
  )
  return { root, dispose: () => {} }
}
