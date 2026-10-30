import { describe, expect, it } from "vitest"
import { AND_CALL, CountCaller } from "../DanceCoachLens/Assets/Scripts/Core/CountCaller"
import { decodeSettings, encodeSettings } from "../DanceCoachLens/Assets/Scripts/Core/SettingsStore"
import { LOOKBACK_TOAST, PlaybackController, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { POSE_BAR_HIDE_SEC, PoseController, scrubLabel, stepCountLabel } from "../DanceCoachLens/Assets/Scripts/Core/PoseController"
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
    const settings = { speed: 0.75 as const, mirror: true, counts: false, halfCounts: true }
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
    expect(pose.enter(3)).toEqual({ screen: "D", section: 3, step: 0, halfCounts: false, stepId: 0 })
    expect(pose.tick(1)).toEqual({ screen: "D", section: 3, step: 0, halfCounts: false, stepId: 0 })
  })

  it("opens on count 1, whichever section it was left on", () => {
    const pose = new PoseController()
    pose.enter(2)
    expect(pose.enter(3).step).toBe(0)
  })

  it("labels a step's count and the scrub line", () => {
    expect([0, 1, 2, 9, 15].map(stepCountLabel)).toEqual(["1", "1&", "2", "5&", "8&"])
    expect(scrubLabel({ screen: "D", section: 2, step: 0, halfCounts: false, stepId: 0 })).toBe("SECTION 2 · COUNT 1")
    expect(scrubLabel({ screen: "D", section: 2, step: 9, halfCounts: false, stepId: 0 })).toBe("SECTION 2 · COUNT 5&")
  })
})

describe("Pose bar: expands on aim, collapses when idle", () => {
  const opened = (section = 2) => {
    const pose = new PoseController()
    pose.enter(section)
    return pose
  }

  it("stays on screen D until the scrub line is aimed at", () => {
    const pose = opened()
    expect(pose.tick(10).screen).toBe("D")
  })

  it("expands to screen E when aimed at, keeping the section and step", () => {
    const pose = opened(3)
    expect(pose.aim()).toEqual({ screen: "E", section: 3, step: 0, halfCounts: false, stepId: 0 })
  })

  it("collapses after the delay with nothing aimed at it", () => {
    const pose = opened()
    pose.aim()
    expect(pose.tick(POSE_BAR_HIDE_SEC - 0.1).screen).toBe("E")
    expect(pose.tick(0.1).screen).toBe("D")
  })

  it("stays open while it keeps being aimed at", () => {
    const pose = opened()
    for (let t = 0; t < 10; t += 0.1) {
      pose.aim()
      expect(pose.tick(0.1).screen).toBe("E")
    }
    expect(pose.tick(POSE_BAR_HIDE_SEC).screen).toBe("D")
  })

  it("starts the wait again when a control is used", () => {
    const pose = opened()
    pose.aim()
    pose.tick(POSE_BAR_HIDE_SEC - 0.5)
    pose.use()
    expect(pose.tick(POSE_BAR_HIDE_SEC - 0.5).screen).toBe("E")
    expect(pose.tick(0.5).screen).toBe("D")
  })

  it("starts the wait again each time it expands", () => {
    const pose = opened()
    pose.aim()
    pose.tick(POSE_BAR_HIDE_SEC)
    expect(pose.view.screen).toBe("D")
    pose.aim()
    expect(pose.tick(POSE_BAR_HIDE_SEC - 0.1).screen).toBe("E")
  })

  it("opens collapsed whenever Pose is entered", () => {
    const pose = opened()
    pose.aim()
    expect(pose.enter(2).screen).toBe("D")
    expect(pose.tick(POSE_BAR_HIDE_SEC).screen).toBe("D")
  })

  it("has a delay of a few seconds", () => {
    expect(POSE_BAR_HIDE_SEC).toBe(3)
  })
})

/** Opens Pose on section n of a dance with `sections` sections. */
const posed = (sections: number, section = 1, halfCounts = false) => {
  const pose = new PoseController()
  pose.enter(section, sections, halfCounts)
  return pose
}

describe("Pose steps: � and �", () => {
  it("steps by whole counts: count 1, 2, 3 �", () => {
    const pose = posed(3)
    expect(pose.stepForward().step).toBe(2)
    expect(pose.stepForward().step).toBe(4)
    expect(stepCountLabel(pose.view.step)).toBe("3")
    expect(pose.stepBack().step).toBe(2)
  })

  it("steps by half-counts with Half counts on", () => {
    const pose = posed(3, 1, true)
    const labels = [pose.view, pose.stepForward(), pose.stepForward(), pose.stepForward()].map((v) => stepCountLabel(v.step))
    expect(labels).toEqual(["1", "1&", "2", "2&"])
    expect(stepCountLabel(pose.stepBack().step)).toBe("2")
  })

  it("steps past 8 into count 1 of the next section", () => {
    const pose = posed(3, 1)
    for (let i = 0; i < 7; i++) pose.stepForward()
    expect(pose.view).toMatchObject({ section: 1, step: 14 })
    expect(pose.stepForward()).toMatchObject({ section: 2, step: 0 })
  })

  it("steps past 8& into the next section's 1 with Half counts on", () => {
    const pose = posed(3, 1, true)
    for (let i = 0; i < 15; i++) pose.stepForward()
    expect(pose.view).toMatchObject({ section: 1, step: 15 })
    expect(pose.stepForward()).toMatchObject({ section: 2, step: 0 })
  })

  it("steps back from count 1 to the last count of the previous section", () => {
    const pose = posed(3, 2)
    expect(pose.stepBack()).toMatchObject({ section: 1, step: 14 })
    expect(stepCountLabel(pose.view.step)).toBe("8")
  })

  it("steps back from 1 to 8& of the previous section with Half counts on", () => {
    const pose = posed(3, 3, true)
    expect(pose.stepBack()).toMatchObject({ section: 2, step: 15 })
  })

  it("does nothing before the routine's first count", () => {
    const pose = posed(6)
    const before = pose.view
    expect(pose.stepBack()).toBe(before)
    expect(pose.view.stepId).toBe(0)
  })

  it("does nothing after the routine's last count, in a 3- and a 6-section dance", () => {
    for (const sections of [3, 6]) {
      const pose = posed(sections, sections)
      for (let i = 0; i < 7; i++) pose.stepForward()
      expect(pose.view).toMatchObject({ section: sections, step: 14 })
      const end = pose.view
      expect(pose.stepForward()).toBe(end)
    }
  })

  it("does nothing after 8& with Half counts on", () => {
    const pose = posed(3, 3, true)
    for (let i = 0; i < 20; i++) pose.stepForward()
    expect(pose.view).toMatchObject({ section: 3, step: 15 })
  })

  it("walks a 6-section routine forward and back, across every boundary", () => {
    const pose = posed(6)
    for (let i = 0; i < 100; i++) pose.stepForward()
    expect(pose.view).toMatchObject({ section: 6, step: 14 })
    const forward = pose.view.stepId
    expect(forward).toBe(6 * 8 - 1)
    for (let i = 0; i < 100; i++) pose.stepBack()
    expect(pose.view).toMatchObject({ section: 1, step: 0 })
    expect(pose.view.stepId - forward).toBe(6 * 8 - 1)
  })

  it("keeps the bar open: a step starts the wait again", () => {
    const pose = posed(3)
    pose.aim()
    pose.tick(POSE_BAR_HIDE_SEC - 0.5)
    pose.stepForward()
    expect(pose.tick(POSE_BAR_HIDE_SEC - 0.5).screen).toBe("E")
    expect(pose.tick(0.5).screen).toBe("D")
  })
})

describe("Pose: Half counts", () => {
  it("opens with the saved choice", () => {
    expect(posed(3, 1, true).view.halfCounts).toBe(true)
    expect(posed(3, 1, false).view.halfCounts).toBe(false)
  })

  it("turning it off on an \"&\" moves to the count before it", () => {
    const pose = posed(3, 1, true)
    pose.stepForward()
    pose.stepForward()
    pose.stepForward()
    expect(stepCountLabel(pose.view.step)).toBe("2&")
    expect(pose.setHalfCounts(false)).toMatchObject({ step: 2, halfCounts: false })
  })

  it("turning it off or on at a whole count stays put", () => {
    const pose = posed(3, 1, true)
    pose.stepForward()
    pose.stepForward()
    expect(pose.setHalfCounts(false).step).toBe(2)
    expect(pose.setHalfCounts(true).step).toBe(2)
  })

  it("steps by whole counts again once off", () => {
    const pose = posed(3, 1, true)
    pose.setHalfCounts(false)
    expect(pose.stepForward().step).toBe(2)
  })

  it("is saved with the other settings", () => {
    const pc = new PlaybackController(makeDance())
    expect(pc.view.settings.halfCounts).toBe(false)
    const saved = encodeSettings(pc.toggleHalfCounts().settings)
    expect(decodeSettings(saved)).toMatchObject({ halfCounts: true })
    expect(decodeSettings('{"speed":1,"mirror":false,"counts":true}').halfCounts).toBe(false)
    expect(decodeSettings('{"halfCounts":"yes"}').halfCounts).toBe(false)
  })

  it("is kept through Pose and back", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.tapMode()
    expect(pc.toggleHalfCounts().settings.halfCounts).toBe(true)
    expect(pc.tapMode().settings.halfCounts).toBe(true)
  })
})

describe("Leaving Pose after stepping into another section", () => {
  it("lands on Clip ended for the section Pose was on", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 1)
    pc.tapMode()
    expect(pc.tapMode(3)).toMatchObject({ mode: "Playthrough", screen: "C", section: 3, runSection: 3 })
  })
})

describe("CountCaller in Pose", () => {
  it("calls each step's count once, however often the view is read", () => {
    const pose = posed(3)
    const caller = new CountCaller()
    expect(caller.nextStep(pose.view)).toBe(0)
    expect(caller.nextStep(pose.stepForward())).toBe(2)
    expect(caller.nextStep(pose.view)).toBe(0)
    expect(caller.nextStep(pose.stepForward())).toBe(3)
    expect(caller.nextStep(pose.stepBack())).toBe(2)
  })

  it("calls \"&\" with the and clip on a half-count", () => {
    const pose = posed(3, 1, true)
    const caller = new CountCaller()
    expect(caller.nextStep(pose.stepForward())).toBe(AND_CALL)
    expect(caller.nextStep(pose.stepForward())).toBe(2)
    expect(caller.nextStep(pose.stepForward())).toBe(AND_CALL)
  })

  it("calls the same count again when stepping back and forth over it", () => {
    const pose = posed(3)
    const caller = new CountCaller()
    expect(caller.nextStep(pose.stepForward())).toBe(2)
    expect(caller.nextStep(pose.stepBack())).toBe(1)
    expect(caller.nextStep(pose.stepForward())).toBe(2)
  })

  it("calls 1 and 8 across a section boundary", () => {
    const pose = posed(3, 1)
    const caller = new CountCaller()
    for (let i = 0; i < 7; i++) caller.nextStep(pose.stepForward())
    expect(caller.nextStep(pose.stepForward())).toBe(1)
    expect(caller.nextStep(pose.stepBack())).toBe(8)
  })

  it("says nothing at the ends of the routine", () => {
    const pose = posed(3, 1)
    const caller = new CountCaller()
    expect(caller.nextStep(pose.stepBack())).toBe(0)
  })

  it("says nothing on entering, and starts over when Pose opens again", () => {
    const pose = posed(3)
    const caller = new CountCaller()
    caller.nextStep(pose.stepForward())
    expect(caller.nextStep(pose.enter(2, 3))).toBe(0)
    expect(caller.nextStep(pose.stepForward())).toBe(2)
  })
})
