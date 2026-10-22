/**
 * The hand-written dance package for the Milestone 1 test tutorial.
 *
 * The video itself is NOT in the repo (it's someone else's tutorial and the repo is public).
 * Put it at Assets/Dance/Video/ in Lens Studio and assign it to the DanceCoach component.
 *
 * bpm was measured from the audio: a steady 150 bpm. The dancers' movement repeats every beat,
 * so each beat is one count. firstBeatSec is the beat where the dancers hold their starting pose,
 * just before the first move (a jump around 10.5 s). The chorus lands on count 7 of Section 1.
 */
import { DancePackage, loadDancePackage } from "../Scripts/Core/DancePackage"

export const TEST_DANCE: DancePackage = loadDancePackage({
  id: "test-dance",
  title: "Test dance",
  difficulty: "Beginner",
  video: "GoDance.mp4",
  trim: { start: 10, end: 24 },
  bpm: 150,
  firstBeatSec: 10.094,
  source: "TikTok group dance video (GoDance.mp4)",
})
