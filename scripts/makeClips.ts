/**
 * Cuts the test dance video into the clips the Lens plays (see scripts/cutClips.ts).
 *
 *   npm run clips
 *
 * Reads DanceCoachLens/Assets/Dance/Video/<package video> and writes <name>_<clip>.mp4 next
 * to it (git-ignored, like the video). Needs ffmpeg on the PATH. Re-run it after changing
 * the dance package's bpm, firstBeatSec, trim or sections, then let Lens Studio re-import.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { TEST_DANCE } from "../DanceCoachLens/Assets/Dance/TestDance"
import { cutClips } from "./cutClips"

const dir = join("DanceCoachLens", "Assets", "Dance", "Video")
const input = join(dir, TEST_DANCE.video)
if (!existsSync(input)) {
  console.error(`No video at ${input}. Put the test dance video there first.`)
  process.exit(1)
}

for (const clip of cutClips(TEST_DANCE, input, dir)) {
  console.log(`${clip.file}  ${clip.start.toFixed(3)}–${clip.end.toFixed(3)} s`)
}
