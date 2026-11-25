/** The section-start editor's rules, ported from the adjust page (adjust.ts markSection): pure, so Vitest can check them. Times in the package are video seconds; the editor shows seconds into the routine. */
import { CountClock } from "../../../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { loadDancePackage, type DancePackage } from "../../../DanceCoachLens/Assets/Scripts/Core/DancePackage"

/** Sections keep at least this much between their starts, and a start stays this far from the end of the routine. */
export const MIN_GAP_SEC = 0.1
export const STEPS = [0.1, 0.01] as const
export const STEP_LABELS = ["0.1 s", "0.01 s"]

export type SectionEdit = { ok: true; package: DancePackage } | { ok: false; error: string }

export const BAD_TIME = "Type a time in seconds, like 11.2."

/** Where each section starts (video seconds), as the Lens will count them. */
export function sectionStarts(pkg: DancePackage): number[] {
  const clock = new CountClock(pkg)
  return Array.from({ length: clock.sectionCount }, (_, i) => clock.sectionStart(i + 1))
}

/** A start as the editor shows it: seconds into the routine, two decimals. */
export function startText(pkg: DancePackage, start: number): string {
  return Math.max(start - pkg.trim.start, 0).toFixed(2)
}

/** What was typed (seconds into the routine) as a video time; NaN when it is blank or not a number. */
export function parseStart(pkg: DancePackage, text: string): number {
  const t = text.trim().replace(",", ".")
  return t === "" || !/^\d*\.?\d+$|^\d+\.$/.test(t) ? NaN : pkg.trim.start + Number(t)
}

/** Marks section n as starting at video time t. Every section is pinned, so one that moves can't cross its neighbours. */
export function setSectionStart(pkg: DancePackage, n: number, t: number): SectionEdit {
  const starts = sectionStarts(pkg)
  if (!Number.isInteger(n) || n < 1 || n > starts.length) return { ok: false, error: `There's no section ${n}.` }
  if (!isFinite(t)) return { ok: false, error: BAD_TIME }
  if (t < pkg.trim.start) return { ok: false, error: "A section can't start before the routine does." }
  if (n > 1 && t < starts[n - 2] + MIN_GAP_SEC) return { ok: false, error: `Section ${n} has to start after section ${n - 1}.` }
  const next = n < starts.length ? starts[n] : pkg.trim.end
  if (t > next - MIN_GAP_SEC) return { ok: false, error: n < starts.length ? `Section ${n} has to start before section ${n + 1}.` : "The last section has to start before the routine ends." }
  starts[n - 1] = t
  const sections = starts.map((start, i) => ({ ...pkg.sections?.[i], start }))
  const edited = { ...pkg, sections, ...(n === 1 ? { firstBeatSec: t } : {}) }
  try {
    return { ok: true, package: loadDancePackage(edited) }
  } catch (err) {
    return { ok: false, error: (err as Error).message.replace(/^Dance package.*? is invalid: /, "") }
  }
}

/** A step earlier (negative) or later; a section stops at its neighbours instead of refusing the step. */
export function stepSectionStart(pkg: DancePackage, n: number, delta: number): SectionEdit {
  const starts = sectionStarts(pkg)
  if (!Number.isInteger(n) || n < 1 || n > starts.length) return { ok: false, error: `There's no section ${n}.` }
  const lo = n === 1 ? pkg.trim.start : starts[n - 2] + MIN_GAP_SEC
  const hi = (n < starts.length ? starts[n] : pkg.trim.end) - MIN_GAP_SEC
  // Rounded to the hundredth, so repeated steps don't drift.
  const t = Math.round(Math.min(Math.max(starts[n - 1] + delta, lo), hi) * 100) / 100
  return setSectionStart(pkg, n, Math.min(Math.max(t, lo), hi))
}

/** Back to the beat grid: every nudge dropped. */
export function clearNudges(pkg: DancePackage): DancePackage {
  const { sections: _gone, ...rest } = pkg
  return rest
}
