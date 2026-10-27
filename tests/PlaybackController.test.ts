import { describe, expect, it } from "vitest"
import { PlaybackController, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { makeDance } from "./fixtures"

// The fixture: 120 bpm (a count is 0.5 s, a section 4 s), first beat at 1 s, sections at 1, 5 and 9 s.

/** Ticks a frozen starting pose for `seconds` of real time, in small frames. */
function holdPose(pc: PlaybackController, seconds: number, frame = 0.05): ViewState {
  let v = pc.view
  for (let t = 0; t < seconds - 1e-9; t += frame) v = pc.tick(pc.view.video.seekTo, Math.min(frame, seconds - t))
  return v
}

/** Ticks the video from `from` to `to` seconds, collecting every view state on the way. */
function play(pc: PlaybackController, from: number, to: number, frame = 0.05): ViewState[] {
  const views: ViewState[] = []
  for (let t = from; t <= to + 1e-9; t += frame) views.push(pc.tick(t, frame))
  return views
}

describe("PlaybackController: Section 1 leads in from before the trim", () => {
  it("plays the 4 counts before the first beat, dimmed", () => {
    const pc = new PlaybackController(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } }))
    const v = pc.tapSection(1)
    expect(v.screen).toBe("B0")
    expect(v.countIn).toEqual({ number: 5, kind: "leadIn" })
    expect(v.video).toMatchObject({ seekTo: 1, playing: true, dim: true })
    expect(pc.tick(2.6).countIn!.number).toBe(8)
    expect(pc.tick(3.01)).toMatchObject({ screen: "B", section: 1, count: 1, video: { dim: false } })
  })
})

describe("PlaybackController: Section 1 without 4 counts of footage before it starts from a frozen starting pose", () => {
  it("freezes on the first beat with controls locked and counts in from 5", () => {
    const pc = new PlaybackController(makeDance())
    const before = pc.view.video.seekId
    const v = pc.tapSection(1)
    expect(v.screen).toBe("BI")
    expect(v.countIn).toEqual({ number: 5, kind: "startingPose" })
    expect(v.controlsLocked).toBe(true)
    expect(v.leadInFraction).toBe(0)
    expect(v.video).toMatchObject({ seekTo: 1, playing: false, dim: false })
    expect(v.video.seekId).not.toBe(before)
  })

  it("counts 5, 6, 7, 8 on the beat while the frame holds", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(1)
    expect(holdPose(pc, 0.4).countIn!.number).toBe(5)
    expect(holdPose(pc, 0.2).countIn!.number).toBe(6)
    expect(holdPose(pc, 0.5).countIn!.number).toBe(7)
    expect(holdPose(pc, 0.5).countIn!.number).toBe(8)
    expect(pc.view.video.playing).toBe(false)
  })

  it("counts in at the current speed", () => {
    const pc = new PlaybackController(makeDance(), { settings: { speed: 0.5, mirror: false, counts: true } })
    pc.tapSection(1)
    expect(holdPose(pc, 0.9).countIn!.number).toBe(5)
    expect(holdPose(pc, 0.2).countIn!.number).toBe(6)
  })

  it("plays from the held frame on count 1 after the count-in, without seeking again", () => {
    const pc = new PlaybackController(makeDance())
    const seekId = pc.tapSection(1).video.seekId
    const v = holdPose(pc, 2)
    expect(v).toMatchObject({ screen: "B", count: 1, countIn: null, controlsLocked: true })
    expect(v.video).toMatchObject({ playing: true, seekId })
  })
})

describe("PlaybackController: later sections start with a dimmed lead-in", () => {
  it("plays the last 4 counts of the previous section, dimmed", () => {
    const pc = new PlaybackController(makeDance())
    const v = pc.tapSection(2)
    expect(v.screen).toBe("B0")
    expect(v.countIn).toEqual({ number: 5, kind: "leadIn" })
    expect(v.controlsLocked).toBe(true)
    expect(v.video).toMatchObject({ seekTo: 3, playing: true, dim: true })
  })

  it("counts the lead-in on the previous section's counts 5–8", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(3)
    expect(pc.tick(7.1).countIn!.number).toBe(5)
    expect(pc.tick(7.5).countIn!.number).toBe(6)
    expect(pc.tick(8.2).countIn!.number).toBe(7)
    expect(pc.tick(8.99).countIn!.number).toBe(8)
  })

  it("starts the section on 1 when the video reaches it, undimmed and still locked", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    pc.tick(4.9)
    const v = pc.tick(5.01)
    expect(v).toMatchObject({ screen: "B", count: 1, countIn: null, controlsLocked: true })
    expect(v.video).toMatchObject({ playing: true, dim: false })
  })

  it("marks where the section starts along the lead-in and section", () => {
    const pc = new PlaybackController(makeDance())
    expect(pc.tapSection(2).leadInFraction).toBeCloseTo(2 / 6)
  })

  it("leads in from a nudged section start", () => {
    const pc = new PlaybackController(makeDance({ sections: [{ start: 1 }, { start: 5.3 }, { start: 9 }] }))
    expect(pc.tapSection(2).video.seekTo).toBeCloseTo(3.3)
    expect(pc.tick(5.2).screen).toBe("B0")
    expect(pc.tick(5.31).screen).toBe("B")
  })
})

describe("PlaybackController: a section run", () => {
  it("follows the beat as the video plays", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    expect(pc.tick(5.1)).toMatchObject({ count: 1, and: false })
    expect(pc.tick(6.8)).toMatchObject({ count: 4, and: true })
    expect(pc.tick(7).runProgress).toBeCloseTo(0.5)
  })

  it("keeps the controls locked from the count-in until the section ends", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    const views = play(pc, 3, 8.9)
    expect(views.every((v) => v.controlsLocked)).toBe(true)
    expect(views.map((v) => v.screen)).toContain("B0")
    expect(views.map((v) => v.screen)).toContain("B")
  })

  it("ignores section taps while locked", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    pc.tick(6)
    const v = pc.tapSection(3)
    expect(v).toMatchObject({ screen: "B", section: 2 })
  })

  it("stops at the end of count 8 on Clip ended, with controls unlocked and the section ticked", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    play(pc, 3, 8.95)
    const v = pc.tick(9.02)
    expect(v).toMatchObject({ screen: "C", section: 2, controlsLocked: false, countIn: null, doneSections: [2] })
    expect(v.video.playing).toBe(false)
  })

  it("doesn't replay by itself", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(1)
    holdPose(pc, 2)
    pc.tick(5.1)
    const seekId = pc.view.video.seekId
    expect(pc.tick(5.2)).toMatchObject({ screen: "C", video: { playing: false, seekId } })
    expect(pc.tick(6)).toMatchObject({ screen: "C", video: { playing: false, seekId } })
  })

  it("ticks each danced section once, in order", () => {
    const pc = new PlaybackController(makeDance())
    for (const n of [3, 1, 3]) {
      pc.tapSection(n)
      holdPose(pc, 2)
      play(pc, pc.clock.sectionStart(n) - 2, pc.clock.sectionEnd(n) + 0.1)
    }
    expect(pc.view.doneSections).toEqual([1, 3])
  })

  it("keeps saved progress and speed", () => {
    const pc = new PlaybackController(makeDance(), { doneSections: [1], settings: { speed: 0.5, mirror: true, counts: true } })
    expect(pc.tapSection(2).video.rate).toBe(0.5)
    expect(pc.view).toMatchObject({ doneSections: [1], settings: { mirror: true } })
  })
})

describe("PlaybackController: a partial last section", () => {
  // 14.5 s of footage: Section 4 runs 13–14.5, three counts.
  it("ends when the footage ends, on the last count it reached", () => {
    const pc = new PlaybackController(makeDance({ trim: { start: 0, end: 14.5 } }))
    expect(pc.view.sectionCount).toBe(4)
    pc.tapSection(4)
    play(pc, 11, 14.4)
    expect(pc.view.screen).toBe("B")
    const v = pc.tick(14.51)
    expect(v).toMatchObject({ screen: "C2", section: 4, count: 3, controlsLocked: false, doneSections: [4] })
    expect(v.video.playing).toBe(false)
  })
})

describe("PlaybackController: dances of different lengths", () => {
  it("has 3 sections, each runnable, with the last one leading in from Section 2", () => {
    const pc = new PlaybackController(makeDance())
    expect(pc.view.sectionCount).toBe(3)
    expect(pc.tapSection(3).video.seekTo).toBe(7)
    play(pc, 7, 13.1)
    expect(pc.view).toMatchObject({ screen: "C2", doneSections: [3] })
  })

  it("has 6 sections when the footage runs to 25 s", () => {
    const pc = new PlaybackController(makeDance({ trim: { start: 0, end: 25 } }))
    expect(pc.view.sectionCount).toBe(6)
    expect(pc.tapSection(6)).toMatchObject({ screen: "B0", video: { seekTo: 19 } })
    play(pc, 19, 25.1)
    expect(pc.view).toMatchObject({ screen: "C2", section: 6, doneSections: [6] })
  })
})
