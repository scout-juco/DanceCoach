/** The Library's rules (P1): which tab a dance is on, its row text and the resume card's choice. Pure, so Vitest can check them. */
import { danceStatus, levelOf } from "../../../DanceCoachLens/Assets/Scripts/Core/DanceCards"
import type { SpecsState } from "../../link"

/** One entry of GET /dances. */
export interface LibraryDance {
  id: string
  title: string
  difficulty?: string
  sections?: number
  thumbnail?: string
  saved?: boolean
  /** Learned section numbers, as the server last heard them from the Specs. */
  learned: number[]
  /** When the dance was added (ms); newest first. */
  added: number
}

export const TABS = ["In progress", "Learned", "Saved"] as const
export type Tab = (typeof TABS)[number]

export const EMPTY_TEXT: Record<Tab, string> = {
  "In progress": "Nothing in progress. Add a dance, then practice a section on your Specs.",
  Learned: "Dances you have learned every section of show up here.",
  Saved: "Dances you save for later show up here.",
}
export const NO_DANCES_TEXT = "No dances yet. Add one to start learning."

const NAMES = ["", "Easy", "Medium", "Hard"]

/** Live progress (the Specs' own state, one second old at most) wins over what the server last stored. */
export function withLiveProgress(dances: LibraryDance[], state?: SpecsState): LibraryDance[] {
  if (!state) return dances
  return dances.map((d) => (state.progress[d.id] ? { ...d, learned: state.progress[d.id] } : d))
}

export function progressOf(d: LibraryDance): { learned: number; total: number } {
  const total = d.sections ?? 0
  const s = danceStatus(d.learned, total)
  return { learned: s.kind === "new" ? 0 : s.kind === "done" ? total : s.learned, total }
}

/** Learned once every section is; Saved while it is set aside and not started; everything else is in progress (New included). */
export function tabOf(d: LibraryDance): Tab {
  const { learned, total } = progressOf(d)
  if (total > 0 && learned >= total) return "Learned"
  if (d.saved && learned === 0) return "Saved"
  return "In progress"
}

const newestFirst = (a: LibraryDance, b: LibraryDance) => b.added - a.added || a.title.localeCompare(b.title)

export function tabContents(dances: LibraryDance[], tab: Tab): LibraryDance[] {
  return dances.filter((d) => tabOf(d) === tab).sort(newestFirst)
}

/** The row's trailing value: `New`, `1/5`, `4/4 ✓`. */
export function trailingValue(d: LibraryDance): string {
  const { learned, total } = progressOf(d)
  if (learned === 0) return "New"
  return learned >= total ? `${total}/${total} ✓` : `${learned}/${total}`
}

/** "Medium · 5 sections". The difficulty is shown as Easy, Medium or Hard; an unknown one is left as written. */
export function metaLine(d: LibraryDance): string {
  const parts: string[] = []
  if (d.difficulty) parts.push(NAMES[levelOf(d.difficulty)] || d.difficulty)
  if (d.sections !== undefined) parts.push(`${d.sections} section${d.sections === 1 ? "" : "s"}`)
  return parts.join(" · ")
}

/** The dance the Specs last had open, else the newest in progress, else the newest of all; undefined with no dances. */
export function resumeChoice(dances: LibraryDance[], state?: SpecsState): LibraryDance | undefined {
  const open = state?.danceId ? dances.find((d) => d.id === state.danceId) : undefined
  return open ?? tabContents(dances, "In progress")[0] ?? [...dances].sort(newestFirst)[0]
}

/** The section to resume at: where the Specs are on this dance (not the whole routine), else the first one not learned yet. */
export function resumeSection(d: LibraryDance, state?: SpecsState): number {
  const total = d.sections ?? 1
  if (state?.danceId === d.id && state.section >= 1 && state.section <= total) return state.section
  for (let n = 1; n <= total; n++) if (!d.learned.includes(n)) return n
  return 1
}

/** 0.75 -> "0.75×", 1 -> "1×". Only the dance the Specs have open has a speed; otherwise it starts at 1×. */
export function resumeSpeed(d: LibraryDance, state?: SpecsState): string {
  const speed = state?.danceId === d.id ? state.speed : 1
  return `${Number(speed.toFixed(2))}×`
}

export function resumeLine(d: LibraryDance, state?: SpecsState): string {
  return `Section ${resumeSection(d, state)} of ${d.sections ?? 1} · ${resumeSpeed(d, state)}`
}
