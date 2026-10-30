/** Client script of the adjust page (bundled and served as /app.js). All counts come from CountClock. */
import { CountClock } from "../../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { DancePackage, loadDancePackage } from "../../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { overlayLabel } from "./overlay"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
/** A field's number; NaN when it is blank or not a number, so a half-typed value is kept, not read as 0. */
const num = (id: string) => {
  const v = $<HTMLInputElement>(id).value.trim()
  return v === "" ? NaN : Number(v)
}
const field = (v: number, digits?: number) => (isFinite(v) ? (digits === undefined ? String(v) : v.toFixed(digits)) : "")
/** A validation error as the dancer should read it. */
const readable = (err: unknown) => (err as Error).message.replace(/^Dance package.*? is invalid: /, "")
/** Seconds as m:ss, or m:ss.s when the tenths matter on the trim handles. */
const clockText = (t: number, tenths = false) => {
  if (!isFinite(t)) return "–:––"
  const whole = Math.floor(t)
  const text = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
  return tenths ? `${text}.${Math.floor((t - whole) * 10)}` : text
}
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

let pkg: DancePackage
let clock: CountClock
const trimVideo = $<HTMLVideoElement>("trimVideo")
const adjustVideo = $<HTMLVideoElement>("adjustVideo")
const previewVideo = $<HTMLVideoElement>("previewVideo")

/** The screens, one at a time like the phone app. `stack` is where Back goes. */
type Screen = "library" | "add" | "trim" | "ready" | "adjust"
let current: Screen = "library"
let stack: Screen[] = []

function go(to: Screen, { back = false } = {}) {
  for (const v of [trimVideo, adjustVideo, previewVideo]) v.pause()
  if (!back && to !== current) stack.push(current)
  current = to
  if (to === "adjust") adjustVideo.currentTime = pkg.trim.start
  if (to === "ready") previewVideo.currentTime = pkg.trim.start
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((s) => (s.hidden = s.id !== to))
  window.scrollTo(0, 0)
  render()
}
const goBack = () => go(stack.pop() ?? "library", { back: true })
const goHome = () => {
  stack = []
  go("library", { back: true })
}

/** The video of the screen being shown. */
const video = () => (current === "adjust" ? adjustVideo : current === "ready" ? previewVideo : trimVideo)

function say(id: string, text: string, cls = "") {
  const el = $(id)
  el.textContent = text
  el.className = cls
}

/** Both screens that can show a problem share one message. */
function problem(text: string) {
  say("problem", text, "error hint")
  say("problem2", text, "error hint")
}

/**
 * Applies an edit to the draft whatever it holds, so the dancer can pass through wrong values on the way to right ones.
 * The preview follows the last valid draft; errors wait for Ready.
 */
function change(edit: Partial<DancePackage>) {
  pkg = { ...pkg, ...edit }
  try {
    clock = new CountClock(loadDancePackage(pkg))
  } catch {
    // Keep the last valid clock for the preview.
  }
  problem("")
  render()
}

/** The length of the whole video; before it has loaded, the trim end it came with. */
const duration = () => (isFinite(trimVideo.duration) && trimVideo.duration > 0 ? trimVideo.duration : pkg.trim.end)

/** Moves the trim start. The first beat stays on the same beat grid but never falls before the start. */
function setTrimStart(t: number) {
  const start = clamp(t, 0, pkg.trim.end - 0.1)
  const beat = 60 / pkg.bpm
  const firstBeatSec = pkg.firstBeatSec < start && isFinite(beat) ? pkg.firstBeatSec + Math.ceil((start - pkg.firstBeatSec) / beat) * beat : pkg.firstBeatSec
  change({ trim: { ...pkg.trim, start }, firstBeatSec })
}

function setTrimEnd(t: number) {
  change({ trim: { ...pkg.trim, end: clamp(t, pkg.trim.start + 0.1, duration()) } })
}

function render() {
  if (!pkg) return
  $<HTMLInputElement>("firstBeat").value = field(pkg.firstBeatSec, 3)
  $<HTMLInputElement>("bpm").value = field(pkg.bpm)
  const nudged = pkg.sections?.length ?? 0
  say("sectionsInfo", `${clock.sectionCount} sections` + (nudged ? `, ${nudged} nudged by hand` : ""), "hint")

  const total = duration()
  $("sel").style.left = `${(pkg.trim.start / total) * 100}%`
  $("sel").style.right = `${100 - (pkg.trim.end / total) * 100}%`
  $("startHandle").style.left = `${(pkg.trim.start / total) * 100}%`
  $("endHandle").style.left = `${(pkg.trim.end / total) * 100}%`
  $("startLabel").textContent = `${clockText(pkg.trim.start, true)} START`
  $("endLabel").textContent = `${clockText(pkg.trim.end, true)} END`

  $("summary").textContent = `${clockText(pkg.trim.end - pkg.trim.start)} · ${clock.sectionCount} sections`
  const rows = [["Full routine", pkg.trim.start, pkg.trim.end]]
  for (let n = 1; n <= clock.sectionCount; n++) rows.push([`Section ${n}`, clock.sectionStart(n), clock.sectionEnd(n)])
  $("sections").replaceChildren(...rows.map(([name, from, to]) => {
    const row = document.createElement("div")
    row.append(String(name), Object.assign(document.createElement("span"), { className: "mono", textContent: `${clockText(+from)}–${clockText(+to)}` }))
    return row
  }))
  tick()
}

function tick() {
  if (!pkg) return
  const t = video().currentTime
  document.querySelectorAll(".clock").forEach((c) => (c.textContent = `${t.toFixed(3)} s`))
  $("playhead").style.left = `${(trimVideo.currentTime / duration()) * 100}%`
  if (clock) $(current === "ready" ? "previewOverlay" : "overlay").textContent = overlayLabel(clock, t)
  // The previews stop at the end of the part that will be used.
  const v = video()
  if (current !== "adjust" && !v.paused && v.currentTime >= pkg.trim.end) v.pause()
}

/** Marks section n as starting at time t. Earlier sections without a nudge keep where they are now. */
function markSection(n: number, t: number) {
  if (!Number.isInteger(n) || n < 1) return problem("Section must be a whole number from 1.")
  if (n === 1) return change({ firstBeatSec: t })
  const sections = Array.from({ length: n }, (_, i) => pkg.sections?.[i] ?? { start: clock.sectionStart(Math.min(i + 1, clock.sectionCount)) })
  sections[n - 1] = { ...(pkg.sections?.[n - 1] ?? {}), start: t }
  change({ sections: [...sections, ...(pkg.sections?.slice(n) ?? [])] })
}

function show(draft: { package: DancePackage; confidence?: number }) {
  pkg = loadDancePackage(draft.package)
  clock = new CountClock(pkg)
  $<HTMLInputElement>("title").value = pkg.title
  $<HTMLSelectElement>("difficulty").value = pkg.difficulty
  say("detected", draft.confidence === undefined
    ? "Editing a saved dance."
    : `Detected ${pkg.bpm} BPM, first beat at ${pkg.firstBeatSec.toFixed(2)} s, confidence ${Math.round(draft.confidence * 100)}%.`, "hint")
  problem("")
  say("readyStatus", "", "hint")
  trimVideo.src = adjustVideo.src = previewVideo.src = `/dances/${pkg.id}/original`
  go("trim")
}

async function edit(id: string) {
  const res = await fetch(`/dances/${id}/package`)
  if (res.ok) show({ package: await res.json() })
}

function upload(file: File) {
  const bar = $<HTMLProgressElement>("uploadProgress")
  bar.hidden = false
  bar.removeAttribute("value")
  say("uploadStatus", "Uploading…", "hint")
  const xhr = new XMLHttpRequest()
  xhr.open("POST", `/dances?name=${encodeURIComponent(file.name)}`)
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return
    bar.max = e.total
    bar.value = e.loaded
    if (e.loaded === e.total) {
      bar.removeAttribute("value")
      say("uploadStatus", "Finding the beat…", "hint")
    }
  }
  xhr.onload = () => {
    bar.hidden = true
    const body = JSON.parse(xhr.responseText || "{}")
    if (xhr.status === 201) {
      say("uploadStatus", "", "hint")
      show(body)
    } else say("uploadStatus", body.error ?? "Upload failed.", "error hint")
  }
  xhr.onerror = () => {
    bar.hidden = true
    say("uploadStatus", "Couldn't reach the server.", "error hint")
  }
  xhr.send(file)
}

async function fromLink() {
  const url = $<HTMLInputElement>("link").value.trim()
  if (!url) return
  const bar = $<HTMLProgressElement>("uploadProgress")
  const button = $<HTMLButtonElement>("fetchLink")
  button.disabled = true
  bar.hidden = false
  bar.removeAttribute("value")
  say("uploadStatus", "Getting the video, then finding the beat…", "hint")
  try {
    const res = await fetch("/dances/link", { method: "POST", body: JSON.stringify({ url }) })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? "Couldn't get that video. Try uploading the file instead.")
    say("uploadStatus", "", "hint")
    show(body)
  } catch (err) {
    say("uploadStatus", err instanceof TypeError ? "Couldn't reach the server." : (err as Error).message, "error hint")
  } finally {
    bar.hidden = true
    button.disabled = false
  }
}

/** Dances being re-cut: still listed and playable from their old clips, marked until the new ones are in. */
const updating = new Set<string>()

async function ready() {
  try {
    loadDancePackage(pkg)
  } catch (err) {
    return problem(readable(err))
  }
  problem("")
  const button = $<HTMLButtonElement>("readyBtn")
  button.disabled = true
  $("cutProgress").hidden = false
  say("readyStatus", "Cutting the dance into clips…", "hint")
  updating.add(pkg.id)
  loadList()
  try {
    const res = await fetch(`/dances/${pkg.id}`, { method: "PUT", body: JSON.stringify(pkg) })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? "Cutting failed.")
    say("readyStatus", "Done. The dance is ready.", "ok hint")
    loadList()
  } catch (err) {
    say("readyStatus", `Failed: ${(err as Error).message}`, "error hint")
  } finally {
    updating.delete(pkg.id)
    loadList()
    $("cutProgress").hidden = true
    button.disabled = false
  }
}

async function remove(id: string, title: string) {
  if (!confirm(`Delete "${title}"? This removes the video and its clips for good.`)) return
  const res = await fetch(`/dances/${id}`, { method: "DELETE" })
  if (!res.ok) alert((await res.json()).error ?? "Couldn't delete that dance.")
  loadList()
}

async function loadList() {
  const dances: { id: string; title: string; difficulty: string }[] = await (await fetch("/dances")).json()
  if (!dances.length) return $("list").replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: "No dances yet." }))
  $("list").replaceChildren(...dances.map((d) => {
    const li = document.createElement("li")
    const open = Object.assign(document.createElement("button"), { className: "open", onclick: () => edit(d.id) })
    open.append(
      Object.assign(document.createElement("div"), { className: "name", textContent: d.title }),
      Object.assign(document.createElement("div"), { className: "meta", textContent: updating.has(d.id) ? `${d.difficulty} · updating…` : d.difficulty }),
    )
    li.append(open, Object.assign(document.createElement("button"), { className: "chip", textContent: "Delete", onclick: () => remove(d.id, d.title) }))
    return li
  }))
}

/** Dragging a handle moves the trim point and shows that frame; tapping the track just scrubs. */
function wireTrack() {
  const track = $("track")
  let dragging: "start" | "end" | null = null
  const timeAt = (e: PointerEvent) => {
    const r = track.getBoundingClientRect()
    return clamp((e.clientX - r.left) / r.width, 0, 1) * duration()
  }
  track.addEventListener("pointerdown", (e) => {
    trimVideo.pause()
    const target = e.target as HTMLElement
    dragging = target.id === "startHandle" ? "start" : target.id === "endHandle" ? "end" : null
    track.setPointerCapture(e.pointerId)
    if (!dragging) trimVideo.currentTime = timeAt(e)
  })
  track.addEventListener("pointermove", (e) => {
    if (!track.hasPointerCapture(e.pointerId)) return
    const t = timeAt(e)
    if (dragging === "start") setTrimStart(t)
    else if (dragging === "end") setTrimEnd(t)
    trimVideo.currentTime = dragging === "start" ? pkg.trim.start : dragging === "end" ? pkg.trim.end : t
  })
  track.addEventListener("pointerup", () => (dragging = null))
}

const on = (id: string, fn: () => void) => $(id).addEventListener("click", fn)
$<HTMLInputElement>("file").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) upload(file)
})
on("addDance", () => go("add"))
on("fetchLink", fromLink)
document.querySelectorAll<HTMLElement>(".back").forEach((b) => b.addEventListener("click", goBack))
on("toReady", () => go("ready"))
on("toAdjust", () => go("adjust"))
on("adjustDone", goBack)
on("toLibrary", goHome)
on("playPreview", () => {
  // From the start of the trim, so the counts run from the top as the glasses will show them.
  previewVideo.currentTime = pkg.trim.start
  void previewVideo.play()
})
$("title").addEventListener("input", () => change({ title: $<HTMLInputElement>("title").value }))
$("difficulty").addEventListener("change", () => change({ difficulty: $<HTMLSelectElement>("difficulty").value }))
$("firstBeat").addEventListener("change", () => change({ firstBeatSec: num("firstBeat") }))
$("bpm").addEventListener("change", () => change({ bpm: num("bpm") }))
on("trimEndHere", () => setTrimEnd(trimVideo.currentTime))
on("danceStartsHere", () => {
  const t = trimVideo.currentTime
  change({ firstBeatSec: t, trim: { ...pkg.trim, start: clamp(t, 0, pkg.trim.end - 0.1) } })
})
on("firstBeatHere", () => change({ firstBeatSec: adjustVideo.currentTime }))
document.querySelectorAll<HTMLElement>("[data-nudge]").forEach((b) =>
  b.addEventListener("click", () => change({ firstBeatSec: pkg.firstBeatSec + Number(b.dataset.nudge) })))
on("halve", () => change({ bpm: pkg.bpm / 2 }))
on("double", () => change({ bpm: pkg.bpm * 2 }))
document.querySelectorAll<HTMLElement>("[data-step]").forEach((b) =>
  b.addEventListener("click", () => {
    video().pause()
    video().currentTime = Math.max(video().currentTime + Number(b.dataset.step), 0)
  }))
on("sectionAt", () => markSection(num("sectionN"), num("sectionTime")))
on("sectionHere", () => markSection(num("sectionN"), adjustVideo.currentTime))
on("clearSections", () => change({ sections: undefined }))
on("readyBtn", ready)
for (const v of [trimVideo, adjustVideo, previewVideo]) {
  v.addEventListener("timeupdate", tick)
  v.addEventListener("seeked", tick)
}
trimVideo.addEventListener("loadedmetadata", render)
wireTrack()
const frame = () => {
  tick()
  requestAnimationFrame(frame)
}
frame()
loadList()
