/** P1, the Library: "Your dances", the resume card, the three tabs and the dance rows. */
import { button, el, iconButton, segmented, sectionsBar, sectionsLearnedText, setStatusChip, statusChip, thumbnail } from "./kit"
import { openDanceOnSpecs } from "./commands"
import { EMPTY_TEXT, metaLine, NO_DANCES_TEXT, progressOf, resumeChoice, resumeLine, resumeSection, TABS, tabContents, trailingValue, withLiveProgress, type LibraryDance, type Tab } from "./library"
import { NETWORK_ERROR } from "./pairing"
import { showNotConnected, type Ctx, type Screen } from "./screens"

const stillUrl = (d: LibraryDance) => (d.thumbnail ? `/dances/${encodeURIComponent(d.id)}/stills/${encodeURIComponent(d.thumbnail)}` : undefined)

export async function fetchDances(fetchFn: typeof fetch = fetch): Promise<LibraryDance[]> {
  const res = await fetchFn("/dances", { cache: "no-store" })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export function libraryScreen(ctx: Ctx): Screen {
  const root = el("main", "screen")
  const chipEl = statusChip(false, () => ctx.link.snapshot.status !== "connected" && showNotConnected(ctx))
  const body = el("div", "library-body")
  const addBtn = button("Add a dance", { kind: "secondary", icon: "plus", onClick: () => ctx.go("#/add") })
  root.append(el("div", "header-row", {}, el("h1", "display", {}, "Your dances"), chipEl), body, el("div", "footer", {}, addBtn))

  let dances: LibraryDance[] | null = null
  let failed = false
  let tab: Tab = "In progress"
  let practiceError = ""

  const resumeCard = (d: LibraryDance): HTMLElement => {
    const state = ctx.link.snapshot.state
    const { learned, total } = progressOf(d)
    const thumb = thumbnail(96, 168, stillUrl(d), 16)
    thumb.append(el("span", "chip overlay on-thumb", {}, `Sec ${resumeSection(d, state)}`))
    const practice = button("Practice on Specs", {
      height: 48,
      disabled: ctx.link.snapshot.status !== "connected",
      onClick: async () => {
        const token = ctx.getToken()
        if (!token) return ctx.go("#/pair")
        practice.disabled = true
        const result = await openDanceOnSpecs(token, d.id, resumeSection(d, ctx.link.snapshot.state))
        if (result.ok) return ctx.go("#/practice")
        practiceError = result.error
        draw()
      },
    })
    const error = el("p", "error", { role: "alert" }, practiceError)
    error.hidden = !practiceError
    return el(
      "section",
      "resume-card",
      { "aria-label": "Continue" },
      thumb,
      el("div", "resume-text", {}, el("div", "caps volt", {}, "Continue"), el("h2", "card-title", {}, d.title), el("p", "body-text", {}, resumeLine(d, state)), sectionsBar(learned, total), el("div", "meta", {}, sectionsLearnedText(learned, total)), practice, error),
    )
  }

  const row = (d: LibraryDance): HTMLElement => {
    const open = el("button", "dance-row", { type: "button" }, thumbnail(48, 64, stillUrl(d), 12), el("span", "dance-row-text", {}, el("span", "row-title", {}, d.title), el("span", "body-text", {}, metaLine(d))), el("span", "row-value", {}, trailingValue(d)))
    open.addEventListener("click", () => ctx.go(`#/dance/${encodeURIComponent(d.id)}`))
    return open
  }

  const draw = () => {
    if (failed) return body.replaceChildren(el("p", "empty", {}, NETWORK_ERROR), button("Try again", { kind: "secondary", height: 48, onClick: () => void load() }))
    if (!dances) return body.replaceChildren(el("p", "empty", {}, "Loading your dances…"))
    const live = withLiveProgress(dances, ctx.link.snapshot.state)
    const resume = resumeChoice(live, ctx.link.snapshot.state)
    const rows = tabContents(live, tab)
    const list = el("div", "dance-list", { role: "tabpanel" }, ...(rows.length ? rows.map(row) : [el("p", "empty", {}, live.length ? EMPTY_TEXT[tab] : NO_DANCES_TEXT)]))
    body.replaceChildren(
      ...(resume ? [resumeCard(resume)] : []),
      segmented("Library", [...TABS], TABS.indexOf(tab), (i) => {
        tab = TABS[i]
        draw()
      }),
      list,
    )
  }

  async function load() {
    failed = false
    try {
      dances = await fetchDances()
    } catch {
      failed = true
    }
    draw()
  }

  // The chip and the Practice button follow the link. Only a change in who is connected, or in what the Specs have open, redraws.
  let seen = ""
  const off = ctx.link.subscribe((s) => {
    setStatusChip(chipEl, s.status === "connected")
    const key = JSON.stringify([s.status, s.state?.danceId, s.state?.section, s.state?.speed, s.state?.progress])
    if (key === seen) return
    seen = key
    practiceError = ""
    if (dances) draw()
  })
  void load()
  return { root, dispose: off }
}

/** Stand-in for the screens later tickets build (P2, P4, P5), so the Library's buttons land somewhere. */
export function comingScreen(ctx: Ctx, title: string): Screen {
  const root = el("main", "screen")
  root.append(el("div", "back-header", {}, iconButton("back", "Back", { onClick: () => ctx.go("#/") }), el("h1", "title", {}, title)), el("p", "empty", {}, "This screen is coming soon."))
  return { root, dispose: () => {} }
}
