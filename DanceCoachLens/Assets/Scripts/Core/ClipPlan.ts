/**
 * ClipPlan: the short clips the dance video is cut into, one per run start.
 *
 * Lens Studio's player can't jump forward in a video: it plays through to the new time at
 * playback speed (measured in Preview, M1-03). Starting a video from 0 is quick, so every run
 * plays a clip that starts where the run starts: one per section (its lead-in to its end) and
 * one from the top (Section 1's lead-in through the end, for Section 1, Full and From the top).
 *
 * The clips are cut from the package's video by scripts/cutClips.ts, which uses this plan,
 * so the Lens and the script always agree. Times are seconds in the original video.
 * Pure logic: no Lens Studio APIs.
 */
import { CountClock } from "./CountClock"
import { DancePackage } from "./DancePackage"

export interface Clip {
  id: string
  /** Where the clip starts and ends in the original video. The end may be past the footage. */
  start: number
  end: number
}

// Clip starts closer than this are the same start.
const SAME_START_SEC = 0.05

export function planClips(pkg: DancePackage): Clip[] {
  const clock = new CountClock(pkg)
  const last = clock.sectionCount
  const lead = clock.leadIn(1)
  const clips: Clip[] = [{ id: "top", start: lead ? lead.start : clock.sectionStart(1), end: clock.sectionEnd(last) }]
  for (let n = 1; n <= last; n++) {
    const sectionLead = clock.leadIn(n)
    const start = sectionLead ? sectionLead.start : clock.sectionStart(n)
    // Section 1 starts where the top clip does, so that one covers it.
    if (clips.some((c) => Math.abs(c.start - start) < SAME_START_SEC)) continue
    clips.push({ id: `s${n}`, start, end: clock.sectionEnd(n) })
  }
  return clips
}

/** The clip to play for a time in the original video, and how far into it that time is. */
export function clipFor(plan: Clip[], t: number): { clip: Clip; offset: number } {
  let best: Clip | null = null
  for (const c of plan) {
    if (c.start > t + SAME_START_SEC) continue
    // The latest start at or before t; on a tie, the longer clip.
    if (!best || c.start > best.start + SAME_START_SEC || (Math.abs(c.start - best.start) < SAME_START_SEC && c.end > best.end)) best = c
  }
  // Before every clip (shouldn't happen for a run): the earliest one, from its start.
  if (!best) best = plan.reduce((a, b) => (b.start < a.start ? b : a))
  return { clip: best, offset: Math.max(0, t - best.start) }
}

/** The clip's file and asset name: the video's name plus the clip id, e.g. GoDance_s2. */
export function clipAssetName(video: string, id: string): string {
  return `${video.replace(/\.[^.]+$/, "")}_${id}`
}
