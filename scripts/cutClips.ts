/**
 * Cuts a dance's source video into the clips the Lens plays (see Core/ClipPlan.ts).
 *
 * Any dance: give it the package, the source video and the folder to write to. Clips are
 * named after the package's video (Core/ClipPlan.ts clipAssetName), not the source file, so
 * the Lens finds them whatever the source was called. Needs ffmpeg on the PATH.
 * scripts/makeClips.ts runs it for the test dance; the ingest server runs it for the rest.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { DancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"

export interface CutClip {
  id: string
  /** The clip's path: the output folder plus <video name>_<id>.mp4. */
  file: string
  /** Where the clip starts and ends in the source video, in seconds. */
  start: number
  end: number
}

/** The clips the package needs and the ffmpeg arguments that cut each one. Pure: runs nothing. */
export function clipJobs(pkg: DancePackage, sourceVideo: string, outDir: string): { clip: CutClip; args: string[] }[] {
  return planClips(pkg).map(({ id, start, end }) => {
    const file = join(outDir, `${clipAssetName(pkg.video, id)}.mp4`)
    // Re-encoded so each clip starts exactly on its first frame; ffmpeg stops at the end of the footage.
    const args = ["-y", "-loglevel", "error", "-ss", start.toFixed(3), "-i", sourceVideo, "-t", (end - start).toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", file]
    return { clip: { id, file, start, end }, args }
  })
}

/** Cuts every clip with ffmpeg and returns the clips it wrote. Throws if the source is missing or ffmpeg fails. */
export function cutClips(pkg: DancePackage, sourceVideo: string, outDir: string): CutClip[] {
  if (!existsSync(sourceVideo)) throw new Error(`No video at ${sourceVideo}.`)
  mkdirSync(outDir, { recursive: true })
  return clipJobs(pkg, sourceVideo, outDir).map(({ clip, args }) => {
    execFileSync("ffmpeg", args, { stdio: "inherit" })
    return clip
  })
}
