import { describe, expect, it } from "vitest"
import { PlaybackController, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { decodeSettings, encodeSettings } from "../DanceCoachLens/Assets/Scripts/Core/SettingsStore"
import { makeDance } from "./fixtures"

// The fixture: 120 bpm (a count is 0.5 s, a section 4 s), first beat at 1 s, sections at 1, 5 and 9 s.

/** Ticks a frozen starting pose for `seconds` of real time, in small frames. */
function holdPose(pc: PlaybackController, seconds: number, frame = 0.05): ViewState {
  let v = pc.view
  for (let t = 0; t < seconds - 1e-9; t += frame) v = pc.tick(pc.view.video.seekTo, Math.min(frame, seconds - t))
  return v
}

/** Runs section n from its count-in to Clip ended. */
function runSection(pc: PlaybackController, n: number): ViewState {
  pc.tapSection(n)
  if (pc.view.screen === "BI") holdPose(pc, 4)
  for (let t = pc.clock.sectionStart(n) - 2; t <= pc.clock.sectionEnd(n) + 0.1; t += 0.05) pc.tick(t, 0.05)
  return pc.view
}

describe("Replay section", () => {
  it("runs the current section again, after its lead-in count-in", () => {
    const pc = new PlaybackController(makeDance())
    const ended = runSection(pc, 2)
    const v = pc.replay()
    expect(v).toMatchObject({ screen: "B0", section: 2, controlsLocked: true, countIn: { number: 5, kind: "leadIn" } })
    expect(v.video).toMatchObject({ seekTo: 3, playing: true, dim: true })
    expect(v.video.seekId).not.toBe(ended.video.seekId)
  })

  it("runs Section 1 again from its starting pose", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 1)
    expect(pc.replay()).toMatchObject({ screen: "BI", section: 1, countIn: { number: 5, kind: "startingPose" }, video: { seekTo: 1, playing: false } })
  })

  it("ends on Clip ended again, with the section still ticked once", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.replay()
    for (let t = 3; t <= 9.1; t += 0.05) pc.tick(t, 0.05)
    expect(pc.view).toMatchObject({ screen: "C", section: 2, controlsLocked: false, doneSections: [2] })
  })

  it("is ignored while a run is playing", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    pc.tick(6)
    const seekId = pc.view.video.seekId
    expect(pc.replay()).toMatchObject({ screen: "B", video: { seekId } })
  })
})

describe("Speed", () => {
  it("sets the rate the next run plays at, and every run after it", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 1)
    expect(pc.setSpeed(0.5)).toMatchObject({ settings: { speed: 0.5 } })
    expect(pc.tapSection(2).video.rate).toBe(0.5)
    for (let t = 3; t <= 9.1; t += 0.05) pc.tick(t, 0.05)
    expect(pc.replay().video.rate).toBe(0.5)
    expect(pc.tapSection(3).video.rate).toBe(0.5)
  })

  it("slows the starting-pose count-in with the video", () => {
    const pc = new PlaybackController(makeDance())
    pc.setSpeed(0.75)
    pc.tapSection(1)
    // A count is 0.5 s of video, so 0.667 s of real time at 0.75×.
    expect(holdPose(pc, 0.6).countIn!.number).toBe(5)
    expect(holdPose(pc, 0.1).countIn!.number).toBe(6)
  })

  it("can't be changed while a run is playing", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    expect(pc.setSpeed(0.5)).toMatchObject({ settings: { speed: 1 }, video: { rate: 1 } })
  })
})

describe("Mirror and Counts", () => {
  it("toggle, and carry into the next run", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 1)
    expect(pc.toggleMirror().settings).toMatchObject({ mirror: true, counts: true })
    expect(pc.toggleCounts().settings).toMatchObject({ mirror: true, counts: false })
    const v = runSection(pc, 2)
    expect(v.settings).toEqual({ speed: 1, mirror: true, counts: false })
    expect(pc.toggleMirror().settings.mirror).toBe(false)
  })

  it("can't be changed while a run is playing", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    expect(pc.toggleMirror().settings.mirror).toBe(false)
    expect(pc.toggleCounts().settings.counts).toBe(true)
  })
})

describe("Mode button", () => {
  it("stays in Playthrough and shows a coming-soon toast for Pose and Lookback", () => {
    const pc = new PlaybackController(makeDance())
    expect(pc.view.mode).toBe("Playthrough")
    expect(pc.view.toast).toBeNull()
    const v = pc.tapMode()
    expect(v.mode).toBe("Playthrough")
    expect(v.screen).toBe("C")
    expect(v.toast).toMatch(/Pose and Lookback/)
  })

  it("lets the toast go after a few seconds", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapMode()
    expect(pc.tick(0, 1).toast).not.toBeNull()
    expect(pc.tick(0, 3).toast).toBeNull()
  })
})

describe("Saved settings", () => {
  it("round-trip through the store", () => {
    const settings = { speed: 0.75 as const, mirror: true, counts: false }
    expect(decodeSettings(encodeSettings(settings))).toEqual(settings)
  })

  it("restore into a new session", () => {
    const pc = new PlaybackController(makeDance())
    pc.setSpeed(0.5)
    pc.toggleMirror()
    const saved = encodeSettings(pc.view.settings)
    const next = new PlaybackController(makeDance(), { settings: decodeSettings(saved) })
    expect(next.view.settings).toEqual({ speed: 0.5, mirror: true, counts: true })
    expect(next.tapSection(2).video.rate).toBe(0.5)
  })

  it("fall back to the defaults when nothing is saved or the data is bad", () => {
    expect(decodeSettings("")).toEqual({ speed: 1, mirror: false, counts: true })
    expect(decodeSettings("not json")).toEqual({ speed: 1, mirror: false, counts: true })
    expect(decodeSettings('{"speed":2,"mirror":"yes","counts":false}')).toEqual({ speed: 1, mirror: false, counts: false })
  })
})
