/** P5, While you practice: the live mirror of the Specs, and the lookbacks this phone filmed. */
import type { Take } from "../../takes"
import { endSessionOnSpecs } from "./commands"
import { button, chip, el, icon, iconButton, sheet, thumbnail } from "./kit"
import type { LinkSnapshot } from "./linkState"
import {
  agoText, deleteTake, downloadName, fetchTakes, groupTakes, modeChip, NO_LOOKBACKS_TEXT, NOT_CONNECTED_TEXT, RECORDING_TEXT, RECORDING_TITLE,
  sectionLabel, showRecordingBanner, speedLabel, takeTitle, takeUrl,
} from "./practice"
import { fetchPackage } from "./ready"
import { browserDeps, TakeRecorder, type RecorderStatus } from "./recorder"
import type { Ctx, Screen } from "./screens"

export function practiceScreen(ctx: Ctx): Screen {
  const token = ctx.getToken()
  const root = el("main", "screen practice")
  const danceName = el("div", "section-heading", {}, "Your dance")
  const chips = el("div", "chip-row")
  const nowCard = el("div", "now-card", {}, danceName, chips)
  const banner = el("div", "banner pink", { role: "status" }, el("span", "banner-dot", { "aria-hidden": "true" }), el("div", "banner-text", {}, el("div", "row-title", {}, RECORDING_TITLE), el("div", "body-text", {}, RECORDING_TEXT)))
  const away = el("div", "banner away", { role: "status" }, el("span", "dot", { "aria-hidden": "true" }), el("div", "body-text", {}, NOT_CONNECTED_TEXT))
  const cameraNote = el("p", "error", { role: "alert" })
  const listBox = el("div", "lookbacks")
  const message = el("p", "error", { role: "alert" })
  banner.hidden = away.hidden = cameraNote.hidden = message.hidden = true
  const end = button("End session", { kind: "secondary" })
  root.append(
    el("div", "practice-head", {}, el("div", "live-row", {}, el("span", "dot on", { "aria-hidden": "true" }), el("div", "caps volt", {}, "SPECS · PRACTICING NOW")), el("h1", "display", {}, "You're practicing on your Specs")),
    nowCard, away, banner, cameraNote, el("h2", "section-heading", {}, "Your lookbacks"), listBox, message, el("div", "footer", {}, end),
  )

  let disposed = false
  let danceId: string | undefined
  let title = ""
  let takes: Take[] | null = null

  const failed = (text: string) => {
    message.textContent = text
    message.hidden = !text
  }

  const drawNow = (s: LinkSnapshot) => {
    const state = s.state
    away.hidden = s.status === "connected"
    banner.hidden = !(s.status === "connected" && showRecordingBanner(state))
    danceName.textContent = title || (state?.danceId ? "Your dance" : "Opening your dance…")
    if (!state?.danceId) return chips.replaceChildren()
    const mode = modeChip(state.mode)
    chips.replaceChildren(chip(sectionLabel(state.section), { height: 32 }), chip(mode.label, { kind: mode.pink ? "pink" : "default" }), chip(speedLabel(state.speed)))
  }

  const drawTakes = () => {
    if (!danceId || !takes) return listBox.replaceChildren(el("p", "body-text", {}, danceId ? "Loading your lookbacks…" : NO_LOOKBACKS_TEXT))
    if (takes.length === 0) return listBox.replaceChildren(el("p", "body-text", {}, NO_LOOKBACKS_TEXT))
    listBox.replaceChildren(...groupTakes(takes).flatMap((g) => [el("div", "caps group-label", {}, g.label), ...g.takes.map((t) => takeRow(t))]))
  }

  const takeRow = (take: Take) => {
    const name = takeTitle(take)
    const download = el("a", "icon-btn small", { href: takeUrl(danceId!, take), download: downloadName(title || "Dance", take), "aria-label": `Download ${name}` }, icon("download"))
    return el(
      "div", "take-row", {},
      thumbnail(40, 56, undefined, 12),
      el("div", "take-text", {}, el("div", "small-title", {}, name), el("div", "meta small-meta", {}, agoText(take.created, Date.now()))),
      iconButton("play", `Watch ${name}`, { size: 40, fill: "white", onClick: () => watch(take) }),
      download,
      iconButton("trash", `Delete ${name}`, { size: 40, onClick: () => confirmDelete(take) }),
    )
  }

  const watch = (take: Take) => {
    const video = el("video", "watch-video", { src: takeUrl(danceId!, take), controls: "", autoplay: "", playsinline: "", "aria-label": takeTitle(take) })
    const dialog = sheet([el("h2", "section-heading", {}, `${sectionLabel(take.section)} · ${takeTitle(take)}`), video, button("Close", { kind: "secondary", onClick: () => dialog.close() })])
  }

  const confirmDelete = (take: Take) => {
    const label = `${sectionLabel(take.section)}, take ${take.number}`
    const cancel = button("Cancel", { kind: "secondary", onClick: () => dialog.close() })
    const remove = button("Delete", { kind: "secondary", onClick: async () => {
      const t = ctx.getToken()
      if (!t) return ctx.go("#/pair")
      remove.disabled = cancel.disabled = true
      const result = await deleteTake(danceId!, take, t)
      dialog.close()
      if (result.ok) {
        failed("")
        await loadTakes()
      } else failed(result.error)
    } })
    remove.classList.add("confirm-delete")
    const dialog = sheet([el("h2", "section-heading", {}, "Delete this take?"), el("p", "body-text", {}, `${label} will be deleted. This can't be undone.`), cancel, remove])
    cancel.focus()
  }

  async function loadTakes() {
    const id = danceId
    if (!id) return
    const loaded = await fetchTakes(id)
    if (disposed || id !== danceId || !loaded) return // a failed read keeps what is on screen
    takes = loaded
    drawTakes()
  }

  const onState = (s: LinkSnapshot) => {
    const id = s.state?.danceId
    if (id && id !== danceId) {
      danceId = id
      title = ""
      takes = null
      drawTakes()
      void loadTakes()
      void fetchPackage(id).then((r) => {
        if (!disposed && id === danceId && r.ok) {
          title = r.package.title
          drawNow(ctx.link.snapshot)
        }
      })
    }
    drawNow(s)
  }

  // The phone films what the Specs ask for; the screen stays on, and the list refreshes when a take lands.
  const onRecorder = (s: RecorderStatus) => {
    cameraNote.textContent = s.message
    cameraNote.hidden = !(s.isError && s.message)
  }
  const recorder = token ? new TakeRecorder(browserDeps(token), onRecorder, () => void loadTakes()) : null
  void recorder?.start()
  const onVisible = () => document.visibilityState === "visible" && void recorder?.wake()
  document.addEventListener("visibilitychange", onVisible)

  const off = ctx.link.subscribe(onState)
  end.addEventListener("click", async () => {
    const t = ctx.getToken()
    if (!t) return ctx.go("#/pair")
    end.disabled = true
    failed("")
    const result = await endSessionOnSpecs(t)
    if (result.ok) return ctx.go("#/")
    failed(result.error)
    end.disabled = false
  })

  return {
    root,
    dispose: () => {
      disposed = true
      off()
      recorder?.stop()
      document.removeEventListener("visibilitychange", onVisible)
    },
  }
}
