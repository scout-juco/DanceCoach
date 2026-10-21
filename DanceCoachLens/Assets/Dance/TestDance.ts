/**
 * The hand-written dance package for the Milestone 1 test tutorial.
 *
 * The video itself is NOT in the repo (it's someone else's tutorial and the repo is public).
 * Put it at Assets/Dance/Video/ in Lens Studio and assign it to the DanceCoach component.
 * Then set trim, bpm and firstBeatSec to match it.
 */
import { DancePackage, loadDancePackage } from "../Scripts/Core/DancePackage"

export const TEST_DANCE: DancePackage = loadDancePackage({
  id: "test-dance",
  title: "Test dance",
  difficulty: "Beginner",
  video: "test-dance.mp4",
  trim: { start: 0, end: 40 },
  bpm: 100,
  firstBeatSec: 2,
  source: "Placeholder until the test tutorial is chosen",
})
