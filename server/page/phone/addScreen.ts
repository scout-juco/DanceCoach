/** P2, Add a dance, and the processing screen that follows P3. */
import { addFromFile, addFromLink, difficultyDots, EMPTY_LINK_TEXT, fetchStatus, fetchTrending, GETTING_VIDEO, POLL_MS, PROCESSING_FAILED, processingStep, SHARE_HELP, SPLITTING_TEXT, tileMeta, UPLOADING_VIDEO, type DraftResult } from "./add"
import { backHeader, button, chip, el, thumbnail } from "./kit"
import type { LibraryDance } from "./library"
import type { Ctx, Screen } from "./screens"

const stillUrl = (d: LibraryDance) => (d.thumbnail ? `/dances/${encodeURIComponent(d.id)}/stills/${encodeURIComponent(d.thumbnail)}` : undefined)

/** `sharedLink` is a link the Android share sheet handed the app; it is sent at once. */
export function addScreen(ctx: Ctx, sharedLink?: string): Screen {
  const root = el("main", "screen")
  const field = el("input", "input", { id: "link", type: "url", inputmode: "url", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "tiktok.com/@…" }) as HTMLInputElement
  const go = button("Go")
  go.classList.add("go")
  const message = el("p", "meta", { role: "status" })
  message.hidden = true
  const error = el("p", "error", { id: "add-error", role: "alert" })
  error.hidden = true
  const file = el("input", "visually-hidden", { type: "file", accept: "video/*", tabindex: "-1", "aria-hidden": "true" }) as HTMLInputElement
  const upload = button("Upload from camera roll", { kind: "secondary", icon: "photo" })
  upload.classList.add("start")
  const trendingBody = el("div", "trending-grid")
  const trendingSection = el("section", "trending", { "aria-label": "Trending" }, el("h2", "section-heading", {}, "Trending, ready to learn"), trendingBody)
  trendingSection.hidden = true

  root.append(
    backHeader("Add a dance", () => ctx.go("#/")),
    el("div", "field", {}, el("label", "", { for: "link" }, "Paste a video link"), el("div", "link-row", {}, field, go), el("p", "meta", {}, SHARE_HELP), message, error),
    upload,
    file,
    trendingSection,
  )

  let busy = false
  let disposed = false
  const showError = (text: string) => {
    error.textContent = text
    error.hidden = !text
    field.setAttribute("aria-invalid", String(!!text))
    if (text) field.setAttribute("aria-describedby", "add-error")
    else field.removeAttribute("aria-describedby")
  }
  const setBusy = (on: boolean, text = "") => {
    busy = on
    message.textContent = on ? text : ""
    message.hidden = !on
    go.disabled = on
    upload.disabled = on
    field.disabled = on
  }
  const finish = (result: DraftResult) => {
    if (disposed) return
    if (result.ok) return ctx.go(`#/trim/${encodeURIComponent(result.id)}`)
    setBusy(false)
    showError(result.error)
  }
  const submitLink = async (link: string) => {
    if (busy) return
    if (!link.trim()) return showError(EMPTY_LINK_TEXT)
    showError("")
    setBusy(true, GETTING_VIDEO)
    finish(await addFromLink(link))
  }

  field.addEventListener("input", () => {
    showError("")
  })
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void submitLink(field.value)
  })
  go.addEventListener("click", () => void submitLink(field.value))
  upload.addEventListener("click", () => file.click())
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0]
    file.value = ""
    if (!chosen || busy) return
    showError("")
    setBusy(true, UPLOADING_VIDEO)
    finish(await addFromFile(chosen))
  })

  /** A trending dance is already Ready, so it goes straight to P4. */
  const tile = (d: LibraryDance & { lengthSec?: number }): HTMLElement => {
    const thumb = thumbnail(0, 168, stillUrl(d), 16)
    thumb.style.width = "100%"
    thumb.append(el("span", "on-thumb-corner", {}, chip(difficultyDots(d.difficulty), { kind: "overlay", height: 24 })))
    const b = el("button", "tile", { type: "button" }, thumb, el("span", "tile-title", {}, d.title), el("span", "tile-meta", {}, tileMeta(d)))
    b.addEventListener("click", () => ctx.go(`#/dance/${encodeURIComponent(d.id)}`))
    return b
  }
  void fetchTrending()
    .then((dances) => {
      if (disposed || !dances.length) return
      trendingBody.replaceChildren(...dances.map(tile))
      trendingSection.hidden = false
    })
    .catch(() => {})

  if (sharedLink) {
    field.value = sharedLink
    void submitLink(sharedLink)
  }
  return { root, dispose: () => void (disposed = true) }
}

/** Between P3 and P4: the draft's status is polled until its sections are cut. */
export function processingScreen(ctx: Ctx, id: string): Screen {
  const root = el("main", "screen")
  const bar = el("div", "sections-bar progress", { role: "progressbar", "aria-label": "Splitting into sections", "aria-valuemin": "0" })
  const text = el("p", "body-text", { role: "status" }, SPLITTING_TEXT)
  const error = el("p", "error", { role: "alert" })
  error.hidden = true
  const back = button("Back", { kind: "secondary", onClick: () => ctx.go(`#/trim/${encodeURIComponent(id)}`) })
  back.hidden = true
  root.append(el("h1", "display", {}, "Getting it ready"), el("div", "field", {}, text, bar, error), el("div", "footer", {}, back))

  const draw = (done: number, total: number) => {
    bar.setAttribute("aria-valuemax", String(total))
    bar.setAttribute("aria-valuenow", String(done))
    bar.replaceChildren(...Array.from({ length: total }, (_, i) => el("span", i < done ? "learned" : "")))
  }
  draw(0, 1)

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const poll = async () => {
    const status = await fetchStatus(id)
    if (stopped) return
    const step = status ? processingStep(status) : { next: "wait" as const, done: 0, total: 1 }
    if (step.next === "ready") return ctx.go(`#/dance/${encodeURIComponent(id)}`)
    if (step.next === "failed") {
      text.hidden = true
      error.textContent = step.error || PROCESSING_FAILED
      error.hidden = false
      back.hidden = false
      return
    }
    if (status) draw(step.done, step.total)
    timer = setTimeout(poll, POLL_MS)
  }
  void poll()
  return {
    root,
    dispose: () => {
      stopped = true
      clearTimeout(timer)
    },
  }
}
