import { describe, expect, it } from "vitest"
import { PlaybackController, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { makeDance } from "./fixtures"

// The fixture: 120 bpm (a count is 0.5 s, a section 4 s), first beat at 1 s, sections at 1, 5 and 9 s.

/** Ticks the video from `from` to `to` seconds, collecting every view state on the way. */
function play(pc: PlaybackController, from: number, to: number, frame = 0.05): ViewState[] {
  const views: ViewState[] = []
  for (let t = from; t <= to + 1e-9; t += frame) views.push(pc.tick(t, frame))
  return views
}

describe("First look", () => {
  it("on the first open, plays the full routine from Section 1 with the controls locked", () => {
    const pc = new PlaybackController(makeDance())
    const v = pc.open()
    expect(v).toMatchObject({ screen: "PV", runKind: "full", runSection: 1, runStop: 3, countIn: null, controlsLocked: true, firstLookSeen: false })
    expect(v.video).toMatchObject({ seekTo: 1, playing: true, dim: false })
    const views = play(pc, 1, 12.95)
    expect(views.every((w) => w.screen === "PV")).toBe(true)
    expect(views.map((w) => w.runSection).filter((n, i, a) => a.indexOf(n) === i)).toEqual([1, 2, 3])
    expect(views[views.length - 1]).toMatchObject({ runSection: 3, count: 8 })
  })

  it.each([0.5, 0.75] as const)("plays at 1× even when the saved speed is %s×, and keeps that speed for practice", (speed) => {
    const pc = new PlaybackController(makeDance(), { settings: { speed, mirror: false, counts: true } })
    expect(pc.open().video.rate).toBe(1)
    expect(pc.view.settings.speed).toBe(speed)
    play(pc, 1, 13.1)
    expect(pc.view).toMatchObject({ screen: "BI", video: { rate: speed } })
  })

  it("starts from Section 1's lead-in when there's footage for it, undimmed and with no count until Section 1", () => {
    const pc = new PlaybackController(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } }))
    expect(pc.open().video).toMatchObject({ seekTo: 1, playing: true, dim: false })
    expect(pc.tick(2.5)).toMatchObject({ screen: "PV", count: 0, countIn: null })
    expect(pc.tick(3.01)).toMatchObject({ screen: "PV", runSection: 1, count: 1 })
  })

  it("goes on to Section 1's count-in when it ends, and marks the first look seen", () => {
    const pc = new PlaybackController(makeDance())
    pc.open()
    const seekId = pc.view.video.seekId
    play(pc, 1, 12.95)
    const v = pc.tick(13.01)
    expect(v).toMatchObject({ screen: "BI", runKind: "section", section: 1, countIn: { number: 5, kind: "startingPose" }, firstLookSeen: true })
    expect(v.video).toMatchObject({ seekTo: 1, playing: false })
    expect(v.video.seekId).toBeGreaterThan(seekId)
    // The first look isn't a section run, so it doesn't tick any section off.
    expect(v.doneSections).toEqual([])
  })

  it("ends with the footage when the last section is partial", () => {
    const pc = new PlaybackController(makeDance({ trim: { start: 0, end: 11 } }))
    pc.open()
    play(pc, 1, 10.95)
    expect(pc.tick(11.01)).toMatchObject({ screen: "BI", section: 1, firstLookSeen: true })
  })

  it("Skip to Section 1 ends it at once and goes to Section 1's count-in", () => {
    const pc = new PlaybackController(makeDance())
    pc.open()
    play(pc, 1, 6)
    const v = pc.skipFirstLook()
    expect(v).toMatchObject({ screen: "BI", runKind: "section", section: 1, runStop: 1, countIn: { number: 5, kind: "startingPose" }, firstLookSeen: true })
    expect(v.video).toMatchObject({ seekTo: 1, playing: false })
  })

  it("Skip leads in to Section 1 when there's footage for it", () => {
    const pc = new PlaybackController(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } }))
    pc.open()
    play(pc, 1, 8)
    expect(pc.skipFirstLook()).toMatchObject({ screen: "B0", section: 1, countIn: { number: 5, kind: "leadIn" }, video: { seekTo: 1, dim: true } })
  })

  it("ignores Skip outside the first look", () => {
    const pc = new PlaybackController(makeDance(), { firstLookSeen: true })
    const v = pc.open()
    expect(pc.skipFirstLook()).toBe(v)
  })

  it("ignores the controls and section taps while it plays", () => {
    const pc = new PlaybackController(makeDance())
    const v = pc.open()
    expect(pc.setSpeed(0.5)).toBe(v)
    expect(pc.toggleMirror()).toBe(v)
    expect(pc.tapSection(2)).toBe(v)
    expect(pc.fromTheTop()).toBe(v)
    expect(pc.replay()).toBe(v)
  })

  it("on a later open (first look seen) goes straight to Section 1's count-in", () => {
    const pc = new PlaybackController(makeDance(), { firstLookSeen: true })
    expect(pc.view.firstLookSeen).toBe(true)
    expect(pc.open()).toMatchObject({ screen: "BI", runKind: "section", section: 1, countIn: { number: 5, kind: "startingPose" }, controlsLocked: true })
  })

  it("then plays Section 1 and lands on Clip ended", () => {
    const pc = new PlaybackController(makeDance())
    pc.open()
    pc.skipFirstLook()
    for (let i = 0; i < 40; i++) pc.tick(1, 0.05)
    expect(pc.view.screen).toBe("B")
    play(pc, 1, 5.05)
    expect(pc.view).toMatchObject({ screen: "C", section: 1, doneSections: [1], controlsLocked: false })
  })
})
