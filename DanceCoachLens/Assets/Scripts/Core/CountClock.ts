/**
 * CountClock turns video time into section, count and half-count.
 *
 * A section is always exactly 8 counts. Section n (1-based) starts at
 * firstBeatSec + (n − 1) · 8 · (60 / bpm), unless the package nudges it.
 * A nudged section keeps counting on its own beat grid from its nudged start.
 *
 * Pure logic: no Lens Studio APIs.
 */
import { DancePackage } from "./DancePackage"

export const COUNTS_PER_SECTION = 8
/** The lead-in before a section is the last 4 counts of the previous one. */
export const LEAD_IN_COUNTS = 4

// Absorbs float error so a time exactly on a beat lands on that beat.
const EPS = 1e-6

export interface CountPosition {
  /** 1-based section, or 0 before the first beat. */
  section: number
  /** 1–8 within the section (0 before the first beat). */
  count: number
  /** false on the count, true on its "&". */
  and: boolean
}

export class CountClock {
  /** Seconds per count. */
  readonly beatSec: number
  /** Seconds per 8-count section. */
  readonly sectionSec: number
  readonly sectionCount: number

  private readonly starts: number[] = []
  private readonly ends: number[] = []

  constructor(private readonly pkg: DancePackage) {
    this.beatSec = 60 / pkg.bpm
    this.sectionSec = COUNTS_PER_SECTION * this.beatSec
    const derivedCount = Math.max(1, Math.ceil((pkg.trim.end - pkg.firstBeatSec) / this.sectionSec - EPS))
    const nudges = pkg.sections || []
    this.sectionCount = Math.max(derivedCount, nudges.length)
    for (let n = 1; n <= this.sectionCount; n++) {
      const nudge = nudges[n - 1]
      const start = nudge ? nudge.start : pkg.firstBeatSec + (n - 1) * this.sectionSec
      this.starts.push(start)
      this.ends.push(nudge && nudge.end !== undefined ? nudge.end : start + this.sectionSec)
    }
  }

  /** Start time of section n (1-based). */
  sectionStart(n: number): number {
    return this.starts[this.checkSection(n) - 1]
  }

  /** End time of section n: count 8 runs out. May be past the end of the footage for the last section. */
  sectionEnd(n: number): number {
    return this.ends[this.checkSection(n) - 1]
  }

  /**
   * The lead-in window before section n: the last 4 counts of section n − 1. Section 1 leads in
   * from the 4 counts of footage before the trim; null when the video doesn't have that much.
   */
  leadIn(n: number): { start: number; end: number } | null {
    this.checkSection(n)
    const end = this.sectionStart(n)
    const start = end - LEAD_IN_COUNTS * this.beatSec
    return start < -EPS ? null : { start: Math.max(start, 0), end }
  }

  /** The section a time falls in. Before the first beat that's 0; past the last section it stays on the last. */
  sectionAt(t: number): number {
    if (t < this.starts[0] - EPS) return 0
    let n = 1
    while (n < this.sectionCount && t >= this.starts[n] - EPS) n++
    return n
  }

  /** Section, count and half-count at a time. Counts keep going to 8 past the end of the footage. */
  at(t: number): CountPosition {
    const section = this.sectionAt(t)
    if (section === 0) return { section: 0, count: 0, and: false }
    return { section, ...this.countIn(section, t) }
  }

  /** Count and half-count at time t, counted on section n's beat grid (used for lead-ins too). */
  countIn(n: number, t: number): { count: number; and: boolean } {
    const halves = Math.floor(((t - this.sectionStart(n)) / this.beatSec) * 2 + EPS)
    const clamped = Math.min(Math.max(halves, 0), COUNTS_PER_SECTION * 2 - 1)
    return { count: Math.floor(clamped / 2) + 1, and: clamped % 2 === 1 }
  }

  /** True when t is past the last frame of the routine's footage (the video must hold its last frame). */
  isPastFootage(t: number): boolean {
    return t >= this.pkg.trim.end - EPS
  }

  private checkSection(n: number): number {
    if (!(n >= 1 && n <= this.sectionCount && Math.floor(n) === n)) {
      throw new RangeError(`Section ${n} doesn't exist (this dance has ${this.sectionCount})`)
    }
    return n
  }
}
