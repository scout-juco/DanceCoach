/** P4, Ready to learn: the dance, its sections, and where to go from here. */
import type { DancePackage } from "../../../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { backHeader, button, chip, el, setStatusChip, statusChip, thumbnail } from "./kit"
import { openDanceOnSpecs } from "./commands"
import { resumeSection, type LibraryDance } from "./library"
import { difficultyLabel, fetchPackage, saveForLater, sectionRows, summaryLine, thumbnailUrl } from "./ready"
import { showNotConnected, type Ctx, type Screen } from "./screens"

export function readyScreen(ctx: Ctx, id: string): Screen {
  const root = el("main", "screen")
  const status = el("p", "body-text", { role: "status" }, "Getting your dance…")
  const error = el("p", "error", { role: "alert" })
  error.hidden = true
  root.append(backHeader("Ready to learn", () => ctx.go("#/")), status, error)

  let disposed = false
  let cleanup = () => {}
  void fetchPackage(id).then((loaded) => {
    if (disposed) return
    if (!loaded.ok) {
      status.hidden = true
      error.textContent = loaded.error
      error.hidden = false
      return
    }
    status.remove()
    error.remove()
    cleanup = build(ctx, root, loaded.package)
  })
  return {
    root,
    dispose: () => {
      disposed = true
      cleanup()
    },
  }
}

function build(ctx: Ctx, root: HTMLElement, pkg: DancePackage): () => void {
  const header = el(
    "div",
    "ready-header",
    {},
    thumbnail(72, 128, thumbnailUrl(pkg), 16),
    el("div", "ready-text", {}, el("div", "card-title", {}, pkg.title), el("p", "body-text", {}, summaryLine(pkg)), el("div", "", {}, chip(difficultyLabel(pkg.difficulty)))),
  )
  const rows = sectionRows(pkg)
  const list = el("div", "section-list", { role: "list", "aria-label": "Sections" }, ...rows.map((r) => el("div", "section-row", { role: "listitem" }, el("div", "row-title", {}, r.name), el("div", "time-range", {}, r.range))))
  const adjust = button("Adjust section starts", { kind: "secondary", height: 44, small: true, onClick: () => ctx.go(`#/sections/${encodeURIComponent(pkg.id)}`) })
  adjust.classList.add("inline")

  const chipEl = statusChip(false, () => ctx.link.snapshot.status !== "connected" && showNotConnected(ctx))
  const message = el("p", "error", { role: "alert" })
  message.hidden = true
  const fail = (text: string) => {
    message.textContent = text
    message.hidden = !text
  }
  const practice = button("Practice on Specs", { disabled: true })
  const later = button("Save for later", { kind: "ghost", height: 44 })
  const footer = el("div", "footer ready-footer", {}, el("div", "status-row", {}, chipEl), message, practice, later)
  root.append(header, list, el("div", "", {}, adjust), footer)

  // The chip and the lime button follow the link; Practice stays visible but disabled while the Specs are away.
  const sync = (connected: boolean) => {
    setStatusChip(chipEl, connected)
    practice.disabled = !connected
  }
  sync(ctx.link.snapshot.status === "connected")
  const off = ctx.link.subscribe((s) => sync(s.status === "connected"))

  practice.addEventListener("click", async () => {
    const token = ctx.getToken()
    if (!token) return ctx.go("#/pair")
    practice.disabled = true
    fail("")
    const state = ctx.link.snapshot.state
    const asDance: LibraryDance = { id: pkg.id, title: pkg.title, sections: rows.length - 1, learned: state?.progress[pkg.id] ?? [], added: 0 }
    const result = await openDanceOnSpecs(token, pkg.id, resumeSection(asDance, state))
    if (result.ok) return ctx.go("#/practice")
    fail(result.error)
    sync(ctx.link.snapshot.status === "connected")
  })
  later.addEventListener("click", async () => {
    const token = ctx.getToken()
    if (!token) return ctx.go("#/pair")
    later.disabled = true
    fail("")
    const result = await saveForLater(pkg, token)
    if (result.ok) return ctx.go("#/")
    fail(result.error)
    later.disabled = false
  })
  return off
}
