/** P4, Ready to learn: the rules and the calls. Pure or fetch-injected, so Vitest can check them. */
import { CountClock } from "../../../DanceCoachLens/Assets/Scripts/Core/CountClock"
import type { DancePackage } from "../../../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { levelOf } from "../../../DanceCoachLens/Assets/Scripts/Core/DanceCards"
import { difficultyDots } from "./add"
import { NETWORK_ERROR } from "./pairing"
import { clockText } from "./trim"

export const LOAD_FAILED = "We couldn't open that dance. Go back and try again."
const LEVEL_NAMES = ["", "Easy", "Medium", "Hard"]

/** "●●○ MEDIUM". */
export function difficultyLabel(difficulty: string): string {
  const name = LEVEL_NAMES[levelOf(difficulty)] || difficulty
  return `${difficultyDots(difficulty)} ${name.toUpperCase()}`
}

/** "0:31 · 4 sections · 1 dancer". One dancer: the one picked on P3 (or the only one). */
export function summaryLine(pkg: DancePackage): string {
  const n = new CountClock(pkg).sectionCount
  return `${clockText(pkg.trim.end - pkg.trim.start)} · ${n} section${n === 1 ? "" : "s"} · 1 dancer`
}

export interface SectionRow { name: string; range: string }

/** "Full routine" and one row per section with its time range, counted from the start of the routine. */
export function sectionRows(pkg: DancePackage): SectionRow[] {
  const clock = new CountClock(pkg)
  const at = (t: number) => clockText(Math.max(t - pkg.trim.start, 0))
  const rows: SectionRow[] = [{ name: "Full routine", range: `${at(pkg.trim.start)}–${at(pkg.trim.end)}` }]
  for (let n = 1; n <= clock.sectionCount; n++) {
    const from = clock.sectionStart(n)
    const to = clock.sectionEnd(n)
    const counts = Math.max(Math.round((to - from) / clock.beatSec), 1)
    rows.push({ name: `Section ${n} · ${counts} counts`, range: `${at(from)}–${at(to)}` })
  }
  return rows
}

/** The thumbnail: the first still, else nothing (the placeholder gradient stays). */
export function thumbnailUrl(pkg: DancePackage): string | undefined {
  const still = pkg.stills?.[0]?.[0]
  return still ? `/dances/${encodeURIComponent(pkg.id)}/stills/${encodeURIComponent(still)}` : undefined
}

export type PackageLoad = { ok: true; package: DancePackage } | { ok: false; error: string }

/** A ready dance's package. */
export async function fetchPackage(id: string, fetchFn: typeof fetch = fetch): Promise<PackageLoad> {
  try {
    const res = await fetchFn(`/dances/${encodeURIComponent(id)}/package`, { cache: "no-store" })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body?.id) return { ok: true, package: body }
    return { ok: false, error: typeof body?.error === "string" ? body.error : LOAD_FAILED }
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string }

/** Saves a package over the dance's: the server cuts again only if the timing changed. */
export async function savePackage(pkg: DancePackage, token: string, fetchFn: typeof fetch = fetch): Promise<SaveResult> {
  try {
    const res = await fetchFn(`/dances/${encodeURIComponent(pkg.id)}`, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(pkg) })
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: typeof body.error === "string" ? body.error : NETWORK_ERROR }
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
}

/** "Save for later": the dance waits under Saved until it is practised. */
export function saveForLater(pkg: DancePackage, token: string, fetchFn: typeof fetch = fetch): Promise<SaveResult> {
  return savePackage({ ...pkg, saved: true }, token, fetchFn)
}
