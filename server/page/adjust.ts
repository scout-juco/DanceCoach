/** Client script of the adjust page (bundled and served as /app.js). All counts come from CountClock. */
import { CountClock } from "../../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { DancePackage, loadDancePackage } from "../../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { overlayLabel } from "./overlay"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const num = (id: string) => Number($<HTMLInputElement>(id).value)

let pkg: DancePackage
let clock: CountClock
const video = $<HTMLVideoElement>("video")

function say(id: string, text: string, cls = "") {
  const el = $(id)
  el.textContent = text
  el.className = cls
}

/** Applies an edit to the package. An invalid result is shown and not applied, so the preview never breaks. */
function change(edit: Partial<DancePackage>) {
  try {
    const next = loadDancePackage({ ...pkg, ...edit })
    clock = new CountClock(next)
    pkg = next
    say("problem", "")
  } catch (err) {
    say("problem", (err as Error).message.replace(/^Dance package.*? is invalid: /, ""), "error")
  }
  render()
}

function render() {
  $<HTMLInputElement>("trimStart").value = String(pkg.trim.start)
  $<HTMLInputElement>("trimEnd").value = String(pkg.trim.end)
  $<HTMLInputElement>("firstBeat").value = pkg.firstBeatSec.toFixed(3)
  $<HTMLInputElement>("bpm").value = String(pkg.bpm)
  const nudged = pkg.sections?.length ?? 0
  say("sectionsInfo", `${clock.sectionCount} sections` + (nudged ? `, ${nudged} nudged by hand` : ""))
  tick()
}

function tick() {
  if (clock) $("overlay").textContent = overlayLabel(clock, video.currentTime)
}

/** Marks section n as starting at time t. Earlier sections without a nudge keep where they are now. */
function markSection(n: number, t: number) {
  if (!Number.isInteger(n) || n < 1) return say("problem", "Section must be a whole number from 1.", "error")
  if (n === 1) return change({ firstBeatSec: t })
  const sections = Array.from({ length: n }, (_, i) => pkg.sections?.[i] ?? { start: clock.sectionStart(Math.min(i + 1, clock.sectionCount)) })
  sections[n - 1] = { ...(pkg.sections?.[n - 1] ?? {}), start: t }
  change({ sections: [...sections, ...(pkg.sections?.slice(n) ?? [])] })
}

function show(draft: { package: DancePackage; confidence: number }) {
  pkg = loadDancePackage(draft.package)
  clock = new CountClock(pkg)
  $<HTMLInputElement>("title").value = pkg.title
  $<HTMLSelectElement>("difficulty").value = pkg.difficulty
  say("detected", `Detected ${pkg.bpm} BPM, first beat at ${pkg.firstBeatSec.toFixed(2)} s, confidence ${Math.round(draft.confidence * 100)}%.`)
  video.src = `/dances/${pkg.id}/original`
  $("adjust").hidden = false
  render()
}

function upload(file: File) {
  const bar = $<HTMLProgressElement>("uploadProgress")
  bar.hidden = false
  bar.removeAttribute("value")
  say("uploadStatus", "Uploading…")
  const xhr = new XMLHttpRequest()
  xhr.open("POST", `/dances?name=${encodeURIComponent(file.name)}`)
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return
    bar.max = e.total
    bar.value = e.loaded
    if (e.loaded === e.total) {
      bar.removeAttribute("value")
      say("uploadStatus", "Finding the beat…")
    }
  }
  xhr.onload = () => {
    bar.hidden = true
    const body = JSON.parse(xhr.responseText || "{}")
    if (xhr.status === 201) {
      say("uploadStatus", "")
      show(body)
    } else say("uploadStatus", body.error ?? "Upload failed.", "error")
  }
  xhr.onerror = () => {
    bar.hidden = true
    say("uploadStatus", "Couldn't reach the server.", "error")
  }
  xhr.send(file)
}

async function ready() {
  const button = $<HTMLButtonElement>("ready")
  button.disabled = true
  $("cutProgress").hidden = false
  say("readyStatus", "Cutting the dance into clips…")
  try {
    const res = await fetch(`/dances/${pkg.id}`, { method: "PUT", body: JSON.stringify(pkg) })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? "Cutting failed.")
    say("readyStatus", "Done. The dance is ready.", "ok")
    loadList()
  } catch (err) {
    say("readyStatus", `Failed: ${(err as Error).message}`, "error")
  } finally {
    $("cutProgress").hidden = true
    button.disabled = false
  }
}

async function loadList() {
  const dances: { id: string; title: string; difficulty: string }[] = await (await fetch("/dances")).json()
  $("list").replaceChildren(...dances.map((d) => Object.assign(document.createElement("li"), { textContent: `${d.title} (${d.difficulty})` })))
}

const on = (id: string, fn: () => void) => $(id).addEventListener("click", fn)
$<HTMLInputElement>("file").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) upload(file)
})
$("title").addEventListener("input", () => change({ title: $<HTMLInputElement>("title").value }))
$("difficulty").addEventListener("change", () => change({ difficulty: $<HTMLSelectElement>("difficulty").value }))
$("trimStart").addEventListener("change", () => change({ trim: { ...pkg.trim, start: num("trimStart") } }))
$("trimEnd").addEventListener("change", () => change({ trim: { ...pkg.trim, end: num("trimEnd") } }))
$("firstBeat").addEventListener("change", () => change({ firstBeatSec: num("firstBeat") }))
$("bpm").addEventListener("change", () => change({ bpm: num("bpm") }))
on("trimStartHere", () => change({ trim: { ...pkg.trim, start: video.currentTime } }))
on("trimEndHere", () => change({ trim: { ...pkg.trim, end: video.currentTime } }))
on("firstBeatHere", () => change({ firstBeatSec: video.currentTime }))
document.querySelectorAll<HTMLElement>("[data-nudge]").forEach((b) =>
  b.addEventListener("click", () => change({ firstBeatSec: pkg.firstBeatSec + Number(b.dataset.nudge) })))
on("halve", () => change({ bpm: pkg.bpm / 2 }))
on("double", () => change({ bpm: pkg.bpm * 2 }))
on("sectionHere", () => markSection(num("sectionN"), video.currentTime))
on("clearSections", () => change({ sections: undefined }))
on("ready", ready)
video.addEventListener("timeupdate", tick)
video.addEventListener("seeked", tick)
const frame = () => {
  tick()
  requestAnimationFrame(frame)
}
frame()
loadList()
