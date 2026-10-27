import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { detectBeats } from "../server/detectBeats"
import { decodeAudio } from "../server/media"

// The test dance video is git-ignored (someone else's tutorial), so this runs where it is present.
const video = "media/originals/GoDance.mp4"

describe.skipIf(!existsSync(video))("detectBeats on the test dance", () => {
  it("finds 150 bpm and the first beat after the trim start", async () => {
    const guess = detectBeats(await decodeAudio(video), 10)
    expect(Math.abs(guess.bpm - 150)).toBeLessThanOrEqual(1)
    expect(Math.abs(guess.firstBeatSec - 10.094)).toBeLessThan(2 / 30)
    expect(guess.confidence).toBeGreaterThan(0.3)
  }, 60_000)
})
