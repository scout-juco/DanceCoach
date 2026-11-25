/** P3, Trim + pick dancer: the rules and the calls. Pure or fetch-injected, so Vitest can check them. The trim rules are ported from the adjust page (adjust.ts). */
import type { DancePackage, FocusRect } from "../../../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { NETWORK_ERROR } from "./pairing"

export const MIN_TRIM_SEC = 0.1
/** Frame thumbnails on the trim bar. */
export const FRAME_COUNT = 8
/** The trim handles are 16 wide; the track keeps their half-width on each side so they stay inside it. */
export const HANDLE_INSET = 8
/** A dragged box smaller than this (a fraction of the frame, either way) is a tap, not a box. */
export const MIN_BOX = 0.05

export const PICK_HELP = "Drag a box around the dancer you want to learn. Your Specs will zoom in on them."
export const PICKED_HELP = "Your Specs will zoom in on this dancer. Drag again to change the box, or tap to clear it."
export const LOADING_TEXT = "Getting your video…"
export const LOAD_FAILED = "We couldn't open that video. Go back and try again."

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Seconds as m:ss. */
export function clockText(t: number): string {
  if (!isFinite(t)) return "–:––"
  const whole = Math.floor(Math.max(t, 0))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}
export const startLabel = (t: number) => `${clockText(t)} START`
export const endLabel = (t: number) => `${clockText(t)} END`

/** What the trim changes in a package: the range, and where count 1 falls. */
export interface TrimState {
  trim: { start: number; end: number }
  firstBeatSec: number
}
type Timing = TrimState & { bpm: number }

/** Moves the trim start. Count 1 stays on the same beat grid but never falls before the start, and never past the end. */
export function moveStart(d: Timing, t: number): TrimState {
  const end = d.trim.end
  let start = clamp(t, 0, end - MIN_TRIM_SEC)
  const beat = 60 / d.bpm
  let first = d.firstBeatSec
  if (first < start && isFinite(beat) && beat > 0) {
    first += Math.ceil((start - first) / beat) * beat
    if (first >= end) {
      // No beat is left after the start: stop the start on the last beat before the end.
      first = d.firstBeatSec + (Math.ceil((end - d.firstBeatSec) / beat) - 1) * beat
      start = Math.min(start, first)
    }
  }
  return { trim: { start, end }, firstBeatSec: first }
}

/** Moves the trim end: after the start, never before count 1, never past the video. */
export function moveEnd(d: Timing, t: number, duration: number): TrimState {
  const floor = Math.max(d.trim.start, d.firstBeatSec) + MIN_TRIM_SEC
  const end = clamp(t, Math.min(floor, duration), duration)
  return { trim: { start: d.trim.start, end }, firstBeatSec: d.firstBeatSec }
}

/** Where a time sits on the track, as a CSS length: handles stay inside it. */
export function trackPosition(t: number, duration: number): string {
  const frac = duration > 0 ? clamp(t / duration, 0, 1) : 0
  return `calc(${frac} * (100% - ${HANDLE_INSET * 2}px) + ${HANDLE_INSET}px)`
}

/** The time under a pointer on the track. */
export function timeAtPointer(clientX: number, trackLeft: number, trackWidth: number, duration: number): number {
  const usable = trackWidth - HANDLE_INSET * 2
  if (usable <= 0) return 0
  return clamp((clientX - trackLeft - HANDLE_INSET) / usable, 0, 1) * duration
}

/** The times of the frame thumbnails: the middle of each equal slice of the video. */
export function frameTimes(duration: number, count = FRAME_COUNT): number[] {
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * duration)
}

export interface Box { x: number; y: number; w: number; h: number }

/** The part of a box the video fills when it is fitted inside without cropping, centred. */
export function contentBox(boxW: number, boxH: number, videoW: number, videoH: number): Box {
  if (!(videoW > 0 && videoH > 0)) return { x: 0, y: 0, w: boxW, h: boxH }
  const scale = Math.min(boxW / videoW, boxH / videoH)
  const w = videoW * scale
  const h = videoH * scale
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
}

/** The box dragged from one point to another (both in the same pixels as `content`), as fractions of the video frame; null for a tap. */
export function focusFromDrag(from: { x: number; y: number }, to: { x: number; y: number }, content: Box): FocusRect | null {
  if (content.w <= 0 || content.h <= 0) return null
  const frac = (p: { x: number; y: number }) => ({ x: clamp((p.x - content.x) / content.w, 0, 1), y: clamp((p.y - content.y) / content.h, 0, 1) })
  const a = frac(from)
  const b = frac(to)
  const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
  return rect.w < MIN_BOX || rect.h < MIN_BOX ? null : rect
}

/** The package that goes to the server: the draft with the trim and the dancer. No dancer picked leaves `focus` out. */
export function splitPackage(draft: DancePackage, state: TrimState, focus: FocusRect | null): DancePackage {
  const { focus: _old, ...rest } = draft
  return { ...rest, trim: state.trim, firstBeatSec: state.firstBeatSec, ...(focus ? { focus } : {}) }
}

export type DraftLoad = { ok: true; package: DancePackage } | { ok: false; error: string }

/** The draft package of an uploaded video. */
export async function fetchDraft(id: string, fetchFn: typeof fetch = fetch): Promise<DraftLoad> {
  try {
    const res = await fetchFn(`/dances/${encodeURIComponent(id)}/draft`, { cache: "no-store" })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body?.package) return { ok: true, package: body.package }
    return { ok: false, error: typeof body?.error === "string" ? body.error : LOAD_FAILED }
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
}

// The save runs while the processing screen shows, so a refusal (no pairing, no network) is kept here for it to read.
const failures = new Map<string, string>()

/** Why the last split of this dance was refused, once; undefined when nothing was. */
export function takeSplitFailure(id: string): string | undefined {
  const error = failures.get(id)
  failures.delete(id)
  return error
}

/** Sends the package to be cut into sections. Does not throw: a failure waits in takeSplitFailure. */
export async function startSplit(pkg: DancePackage, token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  failures.delete(pkg.id)
  try {
    const res = await fetchFn(`/dances/${encodeURIComponent(pkg.id)}`, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(pkg) })
    if (res.ok) return
    const body = await res.json().catch(() => ({}))
    failures.set(pkg.id, typeof body.error === "string" ? body.error : NETWORK_ERROR)
  } catch {
    failures.set(pkg.id, NETWORK_ERROR)
  }
}
