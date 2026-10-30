import { describe, expect, it } from "vitest"
import { LOOKBACK_TOAST, PlaybackController, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { PoseController, scrubLabel, stepCountLabel } from "../DanceCoachLens/Assets/Scripts/Core/PoseController"
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

describe("Mode button: Playthrough → Pose", () => {
  it("enters Pose from Clip ended, on the section the dancer was on", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    const v = pc.tapMode()
    expect(v).toMatchObject({ mode: "Pose", screen: "D", section: 2, toast: null, controlsLocked: false })
  })

  it("enters Pose from C2 too", () => {
    const pc = new PlaybackController(makeDance())
    expect(runSection(pc, 3).screen).toBe("C2")
    expect(pc.tapMode()).toMatchObject({ mode: "Pose", screen: "D", section: 3 })
  })

  it("holds the video paused on the section's start, with no count showing", () => {
    const pc = new PlaybackController(makeDance())
    const ended = runSection(pc, 2)
    const v = pc.tapMode()
    expect(v.video).toMatchObject({ seekTo: 5, playing: false, dim: false, holdFrame: false })
    expect(v.video.seekId).not.toBe(ended.video.seekId)
    expect(v.count).toBe(0)
  })

  it("stays put while it ticks", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    const entered = pc.tapMode()
    const v = pc.tick(5, 1)
    expect(v).toMatchObject({ mode: "Pose", screen: "D", section: 2, video: { playing: false, seekId: entered.video.seekId } })
  })

  it("is ignored while the controls are locked", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "B0", toast: null })
    pc.tick(6)
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "B" })
  })

  it("is ignored during the first look", () => {
    const pc = new PlaybackController(makeDance())
    pc.open()
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "PV" })
  })
})

describe("Mode button: Pose → Lookback toast → Playthrough", () => {
  it("shows the Lookback toast once and lands on Clip ended for the same section", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.tapMode()
    const v = pc.tapMode()
    expect(v).toMatchObject({ mode: "Playthrough", screen: "C", section: 2, toast: LOOKBACK_TOAST, controlsLocked: false })
    expect(pc.tick(5, 1).toast).toBe(LOOKBACK_TOAST)
    expect(pc.tick(5, 3).toast).toBeNull()
  })

  it("says Lookback is still coming", () => {
    expect(LOOKBACK_TOAST).toMatch(/Lookback/)
    expect(LOOKBACK_TOAST).not.toMatch(/Pose/)
  })

  it("lands on C2 once Finish routine has unlocked", () => {
    const pc = new PlaybackController(makeDance(), { finishReady: true })
    runSection(pc, 1)
    pc.tapMode()
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "C2", section: 1 })
  })

  it("comes back ready to replay that one section, after a range", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapRange(1, 2)
    holdPose(pc, 2)
    for (let t = 1; t <= 9.1; t += 0.05) pc.tick(t, 0.05)
    expect(pc.view.screen).toBe("C")
    pc.tapMode()
    const back = pc.tapMode()
    expect(back).toMatchObject({ section: 1, runKind: "section", runSection: 1, runStop: 1, count: 8 })
    expect(pc.replay()).toMatchObject({ screen: "BI", section: 1, runStop: 1 })
  })

  it("cycles again: Clip ended → Pose → Clip ended → Pose", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    expect(pc.tapMode().mode).toBe("Pose")
    expect(pc.tapMode().mode).toBe("Playthrough")
    expect(pc.tapMode()).toMatchObject({ mode: "Pose", toast: null })
  })
})

describe("Mode button: Playthrough's controls in Pose", () => {
  it("ignores section taps, runs, speed and Finish routine while in Pose", () => {
    const pc = new PlaybackController(makeDance(), { finishReady: true })
    runSection(pc, 2)
    const pose = pc.tapMode()
    expect(pc.tapSection(1)).toBe(pose)
    expect(pc.tapRange(1, 3)).toBe(pose)
    expect(pc.replay()).toBe(pose)
    expect(pc.fromTheTop()).toBe(pose)
    expect(pc.setSpeed(0.5)).toBe(pose)
    expect(pc.finish()).toBe(pose)
  })

  it("keeps mirror, speed and counts through Pose and back", () => {
    const settings = { speed: 0.75 as const, mirror: true, counts: false }
    const pc = new PlaybackController(makeDance(), { settings })
    runSection(pc, 2)
    expect(pc.tapMode().settings).toEqual(settings)
    expect(pc.tapMode().settings).toEqual(settings)
    expect(pc.tapSection(2).video.rate).toBe(0.75)
  })
})

describe("PoseController", () => {
  it("opens on screen D for the section it's given", () => {
    const pose = new PoseController()
    expect(pose.enter(3)).toEqual({ screen: "D", section: 3, step: 0 })
    expect(pose.tick(1)).toEqual({ screen: "D", section: 3, step: 0 })
  })

  it("opens on count 1, whichever section it was left on", () => {
    const pose = new PoseController()
    pose.enter(2)
    expect(pose.enter(3).step).toBe(0)
  })

  it("labels a step's count and the scrub line", () => {
    expect([0, 1, 2, 9, 15].map(stepCountLabel)).toEqual(["1", "1&", "2", "5&", "8&"])
    expect(scrubLabel({ screen: "D", section: 2, step: 0 })).toBe("SECTION 2 · COUNT 1")
    expect(scrubLabel({ screen: "D", section: 2, step: 9 })).toBe("SECTION 2 · COUNT 5&")
  })
})
