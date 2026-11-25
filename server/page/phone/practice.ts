/** P5, While you practice: what the Now card says, how the lookbacks are grouped, and the calls. Pure or fetch-injected, so Vitest can check them. */
import type { SpecsMode, SpecsState } from "../../link"
import type { Take } from "../../takes"
import { NETWORK_ERROR } from "./pairing"

export const NO_LOOKBACKS_TEXT = "No lookbacks yet. Start a lookback on your Specs and this phone films it."
export const NOT_CONNECTED_TEXT = "Specs not connected. This page reconnects by itself."
export const RECORDING_TITLE = "Recording lookback"
export const RECORDING_TEXT = "Started from your Specs. Stops when the run ends."
export const DELETE_FAILED = "That take didn't delete. Try again."

/** "Section 2", or "Full routine" for section 0. */
export function sectionLabel(section: number): string {
  return section === 0 ? "Full routine" : `Section ${section}`
}

/** 0.75 -> "0.75×", 1 -> "1×". */
export function speedLabel(speed: number): string {
  return `${Number(speed.toFixed(2))}×`
}

const MODE_NAMES: Record<SpecsMode, string> = { playthrough: "Playthrough", pose: "Pose", lookback: "Lookback" }

/** Pink only for Lookback; Playthrough and Pose are grey with the mode's name. */
export function modeChip(mode: SpecsMode): { label: string; pink: boolean } {
  return { label: MODE_NAMES[mode], pink: mode === "lookback" }
}

/** The pink banner shows exactly while a lookback is recording. */
export function showRecordingBanner(state?: SpecsState): boolean {
  return state?.lookbackRecording === true
}

export function takeTitle(take: Pick<Take, "number" | "speed">): string {
  return `Take ${take.number} · ${speedLabel(take.speed)}`
}

/** "just now", "5 min ago", "2 h ago", "3 d ago". */
export function agoText(created: string, now: number): string {
  const sec = Math.max(0, Math.round((now - Date.parse(created)) / 1000))
  if (!Number.isFinite(sec)) return ""
  if (sec < 60) return "just now"
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`
  if (sec < 86_400) return `${Math.floor(sec / 3600)} h ago`
  return `${Math.floor(sec / 86_400)} d ago`
}

export interface TakeGroup { section: number; label: string; takes: Take[] }

/** By section, the highest section first (the whole routine, section 0, last), and each section's takes newest first. */
export function groupTakes(takes: Take[]): TakeGroup[] {
  const sections = [...new Set(takes.map((t) => t.section))].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : b - a))
  return sections.map((section) => {
    const mine = takes.filter((t) => t.section === section).sort((a, b) => b.number - a.number)
    return { section, label: `${sectionLabel(section).toUpperCase()} · ${mine.length} TAKE${mine.length === 1 ? "" : "S"}`, takes: mine }
  })
}

export const takeUrl = (danceId: string, take: Pick<Take, "name">) => `/dances/${encodeURIComponent(danceId)}/takes/${encodeURIComponent(take.name)}.mp4`

/** "Pretty Boy section 2 take 3.mp4". */
export function downloadName(title: string, take: Pick<Take, "section" | "number">): string {
  const where = take.section === 0 ? "full routine" : `section ${take.section}`
  return `${title} ${where} take ${take.number}.mp4`.replace(/[\/:*?"<>|]/g, "")
}

/** A dance's takes, as the server has them; null when they couldn't be read (the list on screen stays). */
export async function fetchTakes(danceId: string, fetchFn: typeof fetch = fetch): Promise<Take[] | null> {
  try {
    const res = await fetchFn(`/dances/${encodeURIComponent(danceId)}/takes`, { cache: "no-store" })
    return res.ok ? ((await res.json()) as Take[]) : null
  } catch {
    return null
  }
}

export type DeleteResult = { ok: true } | { ok: false; error: string }

/** Deletes one take. A take that is already gone counts as deleted. */
export async function deleteTake(danceId: string, take: Pick<Take, "name">, token: string, fetchFn: typeof fetch = fetch): Promise<DeleteResult> {
  try {
    const res = await fetchFn(`/dances/${encodeURIComponent(danceId)}/takes/${encodeURIComponent(take.name)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
    if (res.ok || res.status === 404) return { ok: true }
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: typeof body.error === "string" ? body.error : DELETE_FAILED }
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
}
