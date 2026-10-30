/**
 * StillPlan: the stills Pose shows, one per half-count of every section (16 per section).
 *
 * Pose can't seek the video quickly (M1-03), so each half-count is cut to an image up front by
 * scripts/cutStills.ts, which uses this plan. Times come from CountClock, the same ones the count
 * overlay uses, so a still matches its count. Times are seconds in the original video.
 * Pure logic: no Lens Studio APIs.
 */
import { CountClock } from "./CountClock"
import { DancePackage, STILLS_PER_SECTION } from "./DancePackage"

export interface Still {
  /** 1-based section. */
  section: number
  /** 0 to 15: count 1, 1&, 2, … 8&. */
  index: number
  /** Where the frame is in the original video. Counts past the end of the footage sit past trim.end. */
  time: number
}

/** Every still the package needs, section by section. */
export function planStills(pkg: DancePackage): Still[] {
  const clock = new CountClock(pkg)
  const stills: Still[] = []
  for (let section = 1; section <= clock.sectionCount; section++) {
    for (let index = 0; index < STILLS_PER_SECTION; index++) {
      stills.push({ section, index, time: clock.sectionStart(section) + (index * clock.beatSec) / 2 })
    }
  }
  return stills
}

/** A still's file name: the video's name, the section and the count, e.g. GoDance_pose2_3and.jpg. */
export function stillAssetName(video: string, section: number, index: number): string {
  const count = Math.floor(index / 2) + 1
  return `${video.replace(/\.[^.]+$/, "")}_pose${section}_${count}${index % 2 ? "and" : ""}.jpg`
}

/** The package's `stills` field: file names per section, in step order. */
export function stillNames(pkg: DancePackage): string[][] {
  const names: string[][] = []
  for (const { section, index } of planStills(pkg)) {
    ;(names[section - 1] ??= []).push(stillAssetName(pkg.video, section, index))
  }
  return names
}
