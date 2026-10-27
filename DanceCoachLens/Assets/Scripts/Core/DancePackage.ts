/**
 * The dance package: everything the Lens needs to know about one dance.
 * It is the same shape the phone app's "Ready to learn" screen (prototype P4)
 * will send in v1. In Milestone 1 it is hand-written.
 *
 * All times are seconds in the video file.
 * Pure data and validation only: no Lens Studio APIs, so Vitest can load it.
 */

/** A manually nudged section boundary (the phone's "Adjust section starts"). */
export interface SectionNudge {
  start: number
  end?: number
}

/** The dancer to frame, as fractions (0–1) of the video frame. */
export interface FocusRect {
  x: number
  y: number
  w: number
  h: number
}

export interface DancePackage {
  id: string
  title: string
  difficulty: string
  /** Name of the video asset in the Lens (the file itself is git-ignored). */
  video: string
  /** The part of the video that is the routine. */
  trim: { start: number; end: number }
  bpm: number
  /** Time of count 1 of Section 1. */
  firstBeatSec: number
  /** Only for manual nudges; otherwise sections are derived from bpm and firstBeatSec. */
  sections?: SectionNudge[]
  focus?: FocusRect
  /** Where the tutorial came from (for credit; not shown in Milestone 1). */
  source: string
}

const isNum = (v: unknown): v is number => typeof v === "number" && isFinite(v)
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0

/** Checks a dance package and returns it typed. Throws with a readable message if it's malformed. */
export function loadDancePackage(raw: unknown): DancePackage {
  const p = raw as Partial<DancePackage>
  const fail = (why: string): never => {
    throw new Error(`Dance package${p && isStr(p.id) ? ` "${p.id}"` : ""} is invalid: ${why}`)
  }
  if (!p || typeof p !== "object") fail("not an object")
  for (const k of ["id", "title", "difficulty", "video", "source"] as const) {
    if (!isStr(p[k])) fail(`${k} must be a non-empty string`)
  }
  if (!p.trim || !isNum(p.trim.start) || !isNum(p.trim.end)) fail("trim needs numeric start and end")
  if (p.trim.end <= p.trim.start) fail("trim.end must be after trim.start")
  if (!isNum(p.bpm) || p.bpm <= 0) fail("bpm must be a positive number")
  if (!isNum(p.firstBeatSec)) fail("firstBeatSec must be a number")
  if (p.firstBeatSec < p.trim.start || p.firstBeatSec >= p.trim.end) fail("firstBeatSec must be inside the trim")
  if (p.sections !== undefined) {
    if (!Array.isArray(p.sections)) fail("sections must be an array")
    p.sections.forEach((s, i) => {
      if (!s || !isNum(s.start)) fail(`sections[${i}].start must be a number`)
      if (s.end !== undefined && (!isNum(s.end) || s.end <= s.start)) fail(`sections[${i}].end must be after its start`)
      if (i > 0 && s.start <= p.sections[i - 1].start) fail("sections must be in order")
    })
  }
  if (p.focus !== undefined) {
    const f = p.focus
    if (![f.x, f.y, f.w, f.h].every(isNum)) fail("focus needs numeric x, y, w, h")
  }
  return p as DancePackage
}
