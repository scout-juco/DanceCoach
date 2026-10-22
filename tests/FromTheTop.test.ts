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

/** Runs section n from its count-in to Clip ended. */
function runSection(pc: PlaybackController, n: number): ViewState {
  pc.tapSection(n)
  if (pc.view.screen === "BI") holdPose(pc, 4)
  play(pc, pc.clock.sectionStart(n) - 2, pc.clock.sectionEnd(n) + 0.1)
  return pc.view
}

/** Counts in from the starting pose, then plays the run from Section 1 until it ends; returns every view while playing. */
function runFromPose(pc: PlaybackController): ViewState[] {
  holdPose(pc, 2)
  return play(pc, pc.clock.sectionStart(1), pc.clock.sectionEnd(pc.view.runStop) + 0.1)
}

describe("From the top", () => {
  it.each([1, 2, 3])("after Section %i, plays from the start of Section 1 to the end of Section %i and stops there", (n) => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, n)
    const v = pc.fromTheTop()
    expect(v).toMatchObject({ runKind: "top", section: n, runSection: 1, runStop: n, video: { seekTo: 1 } })
    holdPose(pc, 2)
    const end = pc.clock.sectionEnd(n)
    const views = play(pc, 1, end - 0.05)
    expect(views.every((w) => w.screen === "F")).toBe(true)
    expect(views[views.length - 1]).toMatchObject({ runSection: n, count: 8 })
    expect(pc.tick(end + 0.02)).toMatchObject({ screen: "C", section: n, controlsLocked: false, video: { playing: false } })
  })

  it("starts from the starting pose when there's no footage before Section 1", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    const v = pc.fromTheTop()
    expect(v).toMatchObject({ screen: "BI", countIn: { number: 5, kind: "startingPose" }, leadInFraction: 0 })
    expect(v.video).toMatchObject({ seekTo: 1, playing: false, dim: false })
  })

  it("leads in with the 4 counts before Section 1, dimmed, when there's footage for them", () => {
    const pc = new PlaybackController(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } }))
    runSection(pc, 2)
    const v = pc.fromTheTop()
    expect(v).toMatchObject({ screen: "B0", runKind: "top", countIn: { number: 5, kind: "leadIn" }, controlsLocked: true })
    expect(v.video).toMatchObject({ seekTo: 1, playing: true, dim: true })
    expect(pc.tick(2.6).countIn!.number).toBe(8)
    expect(pc.tick(3.01)).toMatchObject({ screen: "F", runSection: 1, count: 1, video: { dim: false } })
  })

  it("keeps the controls locked from the count-in until it ends", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.fromTheTop()
    const pose = holdPose(pc, 1)
    const views = runFromPose(pc)
    const running = [pose, ...views.filter((w) => w.screen !== "C")]
    expect(running.map((w) => w.screen)).toEqual(expect.arrayContaining(["BI", "F"]))
    expect(running.every((w) => w.controlsLocked)).toBe(true)
    expect(views[views.length - 1]).toMatchObject({ screen: "C", controlsLocked: false })
  })

  it("ignores commands while it plays", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.fromTheTop()
    holdPose(pc, 2)
    pc.tick(3)
    const seekId = pc.view.video.seekId
    for (const v of [pc.tapSection(3), pc.fromTheTop(), pc.replay(), pc.setSpeed(0.5)]) {
      expect(v).toMatchObject({ screen: "F", runKind: "top", runStop: 2, video: { seekId } })
    }
  })

  it("plays at the current speed, counting in at it too", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.setSpeed(0.75)
    expect(pc.fromTheTop().video.rate).toBe(0.75)
    // A count is 0.5 s of video, so 2/3 s of real time at 0.75×.
    expect(holdPose(pc, 0.6).countIn!.number).toBe(5)
    expect(holdPose(pc, 0.1).countIn!.number).toBe(6)
    expect(pc.view.video.rate).toBe(0.75)
  })

  it("shows which section is playing and how far through it", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 3)
    pc.fromTheTop()
    holdPose(pc, 2)
    expect(pc.tick(2)).toMatchObject({ runSection: 1, count: 3 })
    expect(pc.tick(6)).toMatchObject({ runSection: 2, count: 3, sectionProgress: 0.25 })
    expect(pc.view.runProgress).toBeCloseTo(5 / 12)
    expect(pc.tick(11)).toMatchObject({ runSection: 3, count: 5, sectionProgress: 0.5 })
  })

  it("lands back on the current section, so Replay runs that section", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.fromTheTop()
    runFromPose(pc)
    expect(pc.view).toMatchObject({ screen: "C", section: 2, doneSections: [2] })
    expect(pc.replay()).toMatchObject({ screen: "B0", runKind: "section", section: 2, runStop: 2 })
  })

  it("doesn't tick the sections it chains", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 3)
    pc.fromTheTop()
    runFromPose(pc)
    expect(pc.view.doneSections).toEqual([3])
  })
})

describe("Full", () => {
  it("plays the whole routine from the starting pose, through every section", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    const v = pc.tapSection("full")
    expect(v).toMatchObject({ screen: "BI", runKind: "full", runSection: 1, runStop: 3, controlsLocked: true })
    expect(v.countIn).toEqual({ number: 5, kind: "startingPose" })
    expect(v.video).toMatchObject({ seekTo: 1, playing: false })
    const views = runFromPose(pc)
    const playing = views.filter((w) => w.screen === "B")
    expect(playing.every((w) => w.runKind === "full" && w.controlsLocked)).toBe(true)
    expect([...new Set(playing.map((w) => w.runSection))]).toEqual([1, 2, 3])
    expect(pc.view).toMatchObject({ screen: "C", runKind: "full", controlsLocked: false })
  })

  it("covers every section of a 6-section dance", () => {
    const pc = new PlaybackController(makeDance({ trim: { start: 0, end: 25 } }))
    pc.tapSection("full")
    const views = runFromPose(pc)
    expect([...new Set(views.filter((w) => w.screen === "B").map((w) => w.runSection))]).toEqual([1, 2, 3, 4, 5, 6])
    expect(pc.view.screen).toBe("C")
  })

  it("leads in with the 4 counts before Section 1, dimmed, when there's footage for them", () => {
    const pc = new PlaybackController(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } }))
    expect(pc.tapSection("full")).toMatchObject({ screen: "B0", countIn: { kind: "leadIn" }, video: { seekTo: 1, playing: true, dim: true } })
    pc.tick(2.9)
    expect(pc.tick(3.01)).toMatchObject({ screen: "B", runKind: "full", runSection: 1, count: 1 })
  })

  it("plays at the current speed", () => {
    const pc = new PlaybackController(makeDance(), { settings: { speed: 0.5, mirror: false, counts: true } })
    expect(pc.tapSection("full").video.rate).toBe(0.5)
  })

  it("replays as Full, and From the top after it runs the whole routine", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection("full")
    runFromPose(pc)
    expect(pc.replay()).toMatchObject({ runKind: "full", runStop: 3 })
    runFromPose(pc)
    expect(pc.fromTheTop()).toMatchObject({ runKind: "top", runStop: 3 })
  })
})
