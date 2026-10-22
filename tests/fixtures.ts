import { DancePackage, loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"

/** 120 bpm: one count = 0.5 s, one section = 4 s. First beat at 1 s, 3 full sections. */
export function makeDance(overrides: Partial<DancePackage> = {}): DancePackage {
  return loadDancePackage({
    id: "fixture",
    title: "Fixture dance",
    difficulty: "Beginner",
    video: "fixture.mp4",
    trim: { start: 0, end: 13 },
    bpm: 120,
    firstBeatSec: 1,
    source: "test",
    ...overrides,
  })
}
