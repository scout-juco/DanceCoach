/**
 * Cuts the test dance video into the clips the Lens plays (see Core/ClipPlan.ts).
 *
 *   npm run clips
 *
 * Reads DanceCoachLens/Assets/Dance/Video/<package video> and writes <name>_<clip>.mp4 next
 * to it (git-ignored, like the video). Needs ffmpeg on the PATH. Re-run it after changing
 * the dance package's bpm, firstBeatSec, trim or sections, then let Lens Studio re-import.
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { TEST_DANCE } from "../DanceCoachLens/Assets/Dance/TestDance"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"

const dir = join("DanceCoachLens", "Assets", "Dance", "Video")
const input = join(dir, TEST_DANCE.video)
if (!existsSync(input)) {
  console.error(`No video at ${input}. Put the test dance video there first.`)
  process.exit(1)
}

for (const clip of planClips(TEST_DANCE)) {
  const output = join(dir, `${clipAssetName(TEST_DANCE.video, clip.id)}.mp4`)
  // Re-encoded so each clip starts exactly on its first frame; ffmpeg stops at the end of the footage.
  execFileSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-ss", clip.start.toFixed(3), "-i", input, "-t", (clip.end - clip.start).toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", output],
    { stdio: "inherit" },
  )
  console.log(`${output}  ${clip.start.toFixed(3)}–${clip.end.toFixed(3)} s`)
}
