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
  /**
   * The still of every half-count, per section: STILLS_PER_SECTION file names in order
   * (count 1, 1&, 2, … 8&). Only dances made ready since Pose have them; see Core/StillPlan.ts.
   */
  stills?: string[][]
  /** Where the tutorial came from (for credit; not shown in Milestone 1). */
  source: string
  /** "Save for later" on the phone: the dance sits in the Library's Saved tab until it is practised. */
  saved?: boolean
}

/** 8 counts, each with its "&". */
export const STILLS_PER_SECTION = 16

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
  if (p.saved !== undefined && typeof p.saved !== "boolean") fail("saved must be true or false")
  if (p.focus !== undefined) {
    const f = p.focus
    if (!f || ![f.x, f.y, f.w, f.h].every(isNum)) fail("focus needs numeric x, y, w, h")
    const EPS = 1e-6
    if (f.x < 0 || f.y < 0 || f.w <= 0 || f.h <= 0 || f.x + f.w > 1 + EPS || f.y + f.h > 1 + EPS) fail("focus must be a box inside the frame (fractions from 0 to 1)")
  }
  if (p.stills !== undefined) {
    if (!Array.isArray(p.stills) || p.stills.length === 0) fail("stills must be a list with one entry per section")
    p.stills.forEach((names, i) => {
      if (!Array.isArray(names) || names.length !== STILLS_PER_SECTION) fail(`stills[${i}] must list ${STILLS_PER_SECTION} file names`)
      if (!names.every(isStr)) fail(`stills[${i}] must hold only file names`)
    })
  }
  return p as DancePackage
}
