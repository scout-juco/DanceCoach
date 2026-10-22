import { describe, expect, it } from "vitest"
import { clipAssetName, clipFor, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { PlaybackController } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { makeDance } from "./fixtures"

// The fixture: 120 bpm (a count is 0.5 s, a section 4 s), first beat at 1 s, sections at 1, 5 and 9 s.

describe("planClips", () => {
  it("cuts one clip per section, from its lead-in to its end, and one from the top", () => {
    expect(planClips(makeDance())).toEqual([
      { id: "top", start: 1, end: 13 },
      { id: "s2", start: 3, end: 9 },
      { id: "s3", start: 7, end: 13 },
    ])
  })

  it("gives Section 1 its own clip when it leads in from footage before the trim", () => {
    const plan = planClips(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } }))
    expect(plan[0]).toEqual({ id: "top", start: 3, end: 15 })
    expect(plan[1]).toEqual({ id: "s1", start: 1, end: 7 })
  })

  it("follows nudged sections", () => {
    const plan = planClips(makeDance({ sections: [{ start: 1 }, { start: 5.3 }, { start: 9 }] }))
    expect(plan.find((c) => c.id === "s2")).toEqual({ id: "s2", start: 3.3, end: 9.3 })
  })
})

describe("clipFor", () => {
  const plan = planClips(makeDance())

  it("picks the clip that starts where a run starts", () => {
    expect(clipFor(plan, 3)).toMatchObject({ clip: { id: "s2" }, offset: 0 })
    expect(clipFor(plan, 7)).toMatchObject({ clip: { id: "s3" }, offset: 0 })
    expect(clipFor(plan, 1)).toMatchObject({ clip: { id: "top" }, offset: 0 })
  })

  it("picks the nearest earlier clip for a time inside one, with the offset into it", () => {
    const at = clipFor(plan, 4)
    expect(at.clip.id).toBe("s2")
    expect(at.offset).toBeCloseTo(1)
  })

  it("has a clip starting at every run's seek", () => {
    const pc = new PlaybackController(makeDance())
    for (let n = 1; n <= pc.clock.sectionCount; n++) {
      expect(clipFor(plan, pc.tapSection(n).video.seekTo).offset).toBeCloseTo(0)
      // Unlock for the next tap: run the section to its end.
      for (let t = pc.view.video.seekTo; t <= pc.clock.sectionEnd(n) + 0.1; t += 0.05) pc.tick(t, 0.5)
    }
  })
})

describe("clipAssetName", () => {
  it("names a clip after the video", () => {
    expect(clipAssetName("GoDance.mp4", "s2")).toBe("GoDance_s2")
  })
})
