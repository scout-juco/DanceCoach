/**
 * Cuts the test dance video into the stills Pose shows (see scripts/cutStills.ts).
 *
 *   npm run stills
 *
 * Reads DanceCoachLens/Assets/Dance/Video/<package video> and writes <name>_pose<section>_<count>.jpg
 * next to it (git-ignored, like the video). Needs ffmpeg on the PATH. Re-run it after changing
 * the dance package's bpm, firstBeatSec, trim or sections, then let Lens Studio re-import.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { TEST_DANCE } from "../DanceCoachLens/Assets/Dance/TestDance"
import { cutStills } from "./cutStills"

const dir = join("DanceCoachLens", "Assets", "Dance", "Video")
const input = join(dir, TEST_DANCE.video)
if (!existsSync(input)) {
  console.error(`No video at ${input}. Put the test dance video there first.`)
  process.exit(1)
}

const stills = cutStills(TEST_DANCE, input, dir)
console.log(`Wrote ${stills.length} stills to ${dir}`)
