/**
 * Cuts a dance's source video into the stills Pose shows: one JPEG per half-count of every
 * section (see Core/StillPlan.ts). Named after the package's video, like the clips.
 * Counts past the end of the footage use the last frame. Needs ffmpeg and ffprobe on the PATH.
 * scripts/makeStills.ts runs it for the test dance; the ingest server runs it for the rest.
 */
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { DancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { planStills, stillAssetName } from "../DanceCoachLens/Assets/Scripts/Core/StillPlan"
import { videoFilter } from "./cutClips"

export interface CutStill {
  section: number
  index: number
  /** The still's path: the output folder plus its asset name. */
  file: string
  /** Where the frame is taken in the source video, in seconds (already held to the last frame). */
  time: number
  /** True when the count is past the end of the footage, so this is the last frame. */
  held: boolean
}

// Seeking this far before the end usually lands on the last frame; cutStills backs off further if it doesn't.
const LAST_FRAME_BACKOFF_SEC = 0.04
const RETRY_BACKOFFS_SEC = [0.05, 0.1, 0.2, 0.5]

/** The latest time worth seeking to: just inside the end of the trim or of the footage, whichever comes first. */
export function lastFrameSec(pkg: DancePackage, footageSec: number): number {
  return Math.max(Math.min(pkg.trim.end, footageSec) - LAST_FRAME_BACKOFF_SEC, 0)
}

/** The stills the package needs and the ffmpeg arguments that cut each one. Pure: runs nothing. */
export function stillJobs(
  pkg: DancePackage,
  sourceVideo: string,
  outDir: string,
  footageSec: number,
): { still: CutStill; args: string[] }[] {
  const last = lastFrameSec(pkg, footageSec)
  return planStills(pkg).map(({ section, index, time }) => {
    const at = Math.min(time, last)
    const file = join(outDir, stillAssetName(pkg.video, section, index))
    return { still: { section, index, file, time: at, held: time >= last }, args: stillArgs(pkg, sourceVideo, at, file) }
  })
}

// Full-range YUV, which is what JPEG holds (ffmpeg's mjpeg encoder refuses limited range on some frames).
function stillArgs(pkg: DancePackage, sourceVideo: string, at: number, file: string): string[] {
  return ["-y", "-loglevel", "error", "-ss", at.toFixed(3), "-i", sourceVideo, "-frames:v", "1", "-vf", videoFilter(pkg), "-q:v", "4", "-pix_fmt", "yuvj420p", file]
}

function probeDuration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" })
  return Number(out.trim())
}

/**
 * Cuts every still with ffmpeg and returns the ones it wrote. Throws if the source is missing or ffmpeg fails.
 * The stills past the end of the footage are the same frame: it is cut once and copied.
 */
export function cutStills(pkg: DancePackage, sourceVideo: string, outDir: string): CutStill[] {
  if (!existsSync(sourceVideo)) throw new Error(`No video at ${sourceVideo}.`)
  mkdirSync(outDir, { recursive: true })
  let held: string | undefined
  return stillJobs(pkg, sourceVideo, outDir, probeDuration(sourceVideo)).map(({ still, args }) => {
    if (still.held && held) {
      copyFileSync(held, still.file)
      return still
    }
    execFileSync("ffmpeg", args, { stdio: "inherit" })
    // A seek past the last frame writes nothing and still succeeds: step back until a frame comes.
    for (const back of RETRY_BACKOFFS_SEC) {
      if (existsSync(still.file)) break
      execFileSync("ffmpeg", stillArgs(pkg, sourceVideo, Math.max(still.time - back, 0), still.file), { stdio: "inherit" })
    }
    if (!existsSync(still.file)) throw new Error(`ffmpeg wrote no frame at ${still.time.toFixed(3)} s.`)
    if (still.held) held = still.file
    return still
  })
}
