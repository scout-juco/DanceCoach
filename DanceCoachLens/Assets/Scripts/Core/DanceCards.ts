/**
 * DanceCards: what each card on the Pick a dance panel (screen A) says, apart from how it looks.
 *
 * The difficulty filters, the dots on a card ("●●○ MEDIUM"), the "[LENGTH] · N sections" line and the
 * status pill: New, "n/N sections learned" (in progress: the card gets a white border) or "N/N sections learned ✓".
 * Pure: no Lens Studio APIs.
 */
import { CountClock } from "./CountClock"
import { DancePackage } from "./DancePackage"
import { DanceListing } from "./DanceSource"

export type Filter = "All" | "Easy" | "Medium" | "Hard"
export const FILTERS: Filter[] = ["All", "Easy", "Medium", "Hard"]

/** Beginner, Intermediate, Advanced → 1–3 dots; any other difficulty has none. Easy, Medium and Hard are the filters' names for them. */
export const LEVELS: Record<string, number> = { beginner: 1, easy: 1, intermediate: 2, medium: 2, advanced: 3, hard: 3 }

/** 1–3 for a dance's difficulty, 0 when it isn't one of the known levels. */
export const levelOf = (difficulty?: string) => LEVELS[(difficulty ?? "").toLowerCase()] ?? 0

const FILTER_LEVEL: Record<Filter, number> = { All: 0, Easy: 1, Medium: 2, Hard: 3 }

/** The dances a filter shows: All shows every dance (even one with no known difficulty), the others only that level. */
export function filterDances(dances: DanceListing[], filter: Filter): DanceListing[] {
  const level = FILTER_LEVEL[filter]
  return level === 0 ? dances : dances.filter((d) => levelOf(d.difficulty) === level)
}

export type Status = { kind: "new" } | { kind: "inProgress"; learned: number; total: number } | { kind: "done"; total: number }

/** Where a dance stands. total is its section count; sections outside 1–total are ignored. */
export function danceStatus(doneSections: number[], total: number): Status {
  const learned = doneSections.filter((n, i) => n >= 1 && n <= total && doneSections.indexOf(n) === i).length
  if (learned === 0 || total <= 0) return { kind: "new" }
  return learned >= total ? { kind: "done", total } : { kind: "inProgress", learned, total }
}

/** The status pill's text. */
export function statusText(status: Status): string {
  switch (status.kind) {
    case "new":
      return "New"
    case "inProgress":
      return `${status.learned}/${status.total} sections learned`
    case "done":
      return `${status.total}/${status.total} sections learned ✓`
  }
}

/** "3:05 · 4 sections", or just the sections or just the length when only one is known; "" when neither. */
export function detailsText(listing: DanceListing): string {
  const parts: string[] = []
  if (listing.lengthSec !== undefined) {
    const s = Math.round(listing.lengthSec)
    parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`)
  }
  if (listing.sections !== undefined) parts.push(`${listing.sections} section${listing.sections === 1 ? "" : "s"}`)
  return parts.join(" · ")
}

/** "●●○ MEDIUM": the dots then the difficulty in capitals; "" with no difficulty. */
export function levelLabel(difficulty?: string): string {
  if (!difficulty) return ""
  const n = levelOf(difficulty)
  return `${"●".repeat(n)}${"○".repeat(3 - n)} ${difficulty.toUpperCase()}`.trim()
}

/** The still on a dance's card: Section 1 on count 5, a moment into the dance (its first still if that one's missing); undefined without stills. */
export function thumbnailOf(pkg: DancePackage): string | undefined {
  const first = pkg.stills && pkg.stills[0]
  return first ? first[8] ?? first[0] : undefined
}

/** A dance package's entry in the list: its title and difficulty, how many sections it has and how long the routine is. */
export function listingOf(pkg: DancePackage): DanceListing {
  return { id: pkg.id, title: pkg.title, difficulty: pkg.difficulty, sections: new CountClock(pkg).sectionCount, lengthSec: Math.max(0, pkg.trim.end - pkg.trim.start), thumbnail: thumbnailOf(pkg), ...(pkg.saved ? { saved: true } : {}) }
}
