/**
 * The hand-written dance package for the Milestone 1 test tutorial.
 *
 * The video itself is NOT in the repo (it's someone else's tutorial and the repo is public).
 * Put it at Assets/Dance/Video/ in Lens Studio and assign it to the DanceCoach component.
 *
 * The video is a mirrored tutorial with no music (about 11–21.4 s), then a jump cut to a full
 * playthrough with music (21.4–35.6 s), then an outro. The routine covers both, so the sections
 * are set by hand: the beat grid restarts at the cut.
 *
 * bpm was measured from the playthrough's audio: a steady 150 bpm. The dancers' movement repeats
 * every beat, so each beat is one count. Each part's first count is the beat where the dancers
 * hold their starting pose, just before the first move (a jump about 0.45 s later): 21.624 s in
 * the playthrough, measured from the audio. The tutorial has no beat to measure, so its counts
 * assume the same tempo from the pose at 11.3 s; its last section stretches to the cut.
 */
import { DancePackage, loadDancePackage } from "../Scripts/Core/DancePackage"

export const TEST_DANCE: DancePackage = loadDancePackage({
  id: "test-dance",
  title: "Test dance",
  difficulty: "Beginner",
  video: "GoDanceTutorial.mp4",
  trim: { start: 11, end: 35.6 },
  bpm: 150,
  firstBeatSec: 11.3,
  sections: [
    // Tutorial (no music)
    { start: 11.3 },
    { start: 14.5 },
    { start: 17.7, end: 21.42 },
    // Playthrough (with music)
    { start: 21.624 },
    { start: 24.824 },
    { start: 28.024 },
    { start: 31.224 },
    { start: 34.424 },
  ],
  source: "TikTok group dance tutorial and playthrough (GoDanceTutorial.mp4)",
})
