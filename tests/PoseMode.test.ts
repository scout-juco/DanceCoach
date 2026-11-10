import { describe, expect, it } from "vitest"
import { AND_CALL, CountCaller } from "../DanceCoachLens/Assets/Scripts/Core/CountCaller"
import { decodeSettings, encodeSettings } from "../DanceCoachLens/Assets/Scripts/Core/SettingsStore"
import { NO_SERVER_TOAST, NO_STILLS_TOAST, PlaybackController, TOAST_SEC, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { POSE_BAR_HIDE_SEC, PoseController, scrubLabel, scrubStep, stepCountLabel } from "../DanceCoachLens/Assets/Scripts/Core/PoseController"
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

/** Pose → Lookback → Playthrough: two taps of the mode button. */
function leavePose(pc: PlaybackController, poseSection?: number): ViewState {
  pc.tapMode(poseSection)
  return pc.tapMode()
}

describe("Mode button: Pose → Lookback → Playthrough", () => {
  it("enters Lookback (screen I) on the same section, paused on its start", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.tapMode()
    const v = pc.tapMode()
    expect(v).toMatchObject({ mode: "Lookback", screen: "I", section: 2, toast: null, controlsLocked: false })
    expect(v.video).toMatchObject({ seekTo: pc.clock.sectionStart(2), playing: false, runEnd: pc.clock.sectionEnd(2) })
  })

  it("goes back to Clip ended for the same section", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.tapMode()
    expect(leavePose(pc)).toMatchObject({ mode: "Playthrough", screen: "C", section: 2, toast: null, controlsLocked: false })
  })

  it("lands on C2 once Finish routine has unlocked", () => {
    const pc = new PlaybackController(makeDance(), { finishReady: true })
    runSection(pc, 1)
    pc.tapMode()
    expect(leavePose(pc)).toMatchObject({ mode: "Playthrough", screen: "C2", section: 1 })
  })

  it("comes back ready to replay that one section, after a range", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapRange(1, 2)
    holdPose(pc, 2)
    for (let t = 1; t <= 9.1; t += 0.05) pc.tick(t, 0.05)
    expect(pc.view.screen).toBe("C")
    pc.tapMode()
    const back = pc.tapMode() && pc.tapMode()
    expect(back).toMatchObject({ section: 1, runKind: "section", runSection: 1, runStop: 1, count: 8 })
    expect(pc.replay()).toMatchObject({ screen: "BI", section: 1, runStop: 1 })
  })

  it("cycles all three modes, and again", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    for (let lap = 0; lap < 2; lap++) {
      expect(pc.tapMode()).toMatchObject({ mode: "Pose", screen: "D", toast: null })
      expect(pc.tapMode()).toMatchObject({ mode: "Lookback", screen: "I", toast: null })
      expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "C", toast: null })
    }
  })

  it("is ignored while the controls are locked", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", controlsLocked: true })
  })

  it("keeps speed, mirror and counts across all three modes", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.setSpeed(0.75)
    pc.toggleMirror()
    pc.toggleCounts()
    const settings = pc.view.settings
    for (let i = 0; i < 3; i++) expect(pc.tapMode().settings).toEqual(settings)
  })

  it("changes speed, mirror and counts in Lookback", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.tapMode()
    pc.tapMode()
    pc.setSpeed(0.5)
    pc.toggleMirror()
    expect(pc.view).toMatchObject({ mode: "Lookback", settings: { speed: 0.5, mirror: true } })
  })

  it("ignores Playthrough's runs in Lookback", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    pc.tapMode()
    pc.tapMode()
    expect(pc.tapSection(1)).toMatchObject({ mode: "Lookback", screen: "I" })
    expect(pc.replay().screen).toBe("I")
  })

  it("lets a toast from entering Lookback time out", () => {
    const pc = new PlaybackController(makeDance(), undefined, false)
    runSection(pc, 2)
    expect(pc.tapMode().toast).toBe(NO_STILLS_TOAST)
    expect(pc.tick(5, TOAST_SEC + 0.1).toast).toBeNull()
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

describe("Pose steps: ‹ and ›", () => {
  it("steps by whole counts: count 1, 2, 3 …", () => {
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
    expect(pc.tapMode(3)).toMatchObject({ mode: "Lookback", section: 3 })
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "C", section: 3, runSection: 3 })
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

describe("Pose: scrubbing the bar", () => {
  it("maps a drag to the section's 8 stops, snapping to the nearest", () => {
    const steps = [0, 0.124, 0.126, 0.5, 0.874, 0.876, 1].map((f) => scrubStep(f, false))
    expect(steps).toEqual([0, 0, 2, 8, 12, 14, 14])
    // Each count's stop is centred on its label.
    for (let i = 0; i < 8; i++) expect(scrubStep((i + 0.5) / 8, false)).toBe(i * 2)
  })

  it("maps a drag to 16 stops with Half counts on", () => {
    for (let i = 0; i < 16; i++) expect(scrubStep((i + 0.5) / 16, true)).toBe(i)
    expect(scrubStep(0.03, true)).toBe(0)
    expect(scrubStep(0.04, true)).toBe(0)
    expect(scrubStep(0.07, true)).toBe(1)
  })

  it("clamps a drag past either end of the bar", () => {
    expect(scrubStep(-0.4, false)).toBe(0)
    expect(scrubStep(1.7, false)).toBe(14)
    expect(scrubStep(-0.4, true)).toBe(0)
    expect(scrubStep(1.7, true)).toBe(15)
  })

  it("moves the step within the current section as the drag goes", () => {
    const pose = posed(3, 2)
    expect(pose.scrub(0.5)).toMatchObject({ section: 2, step: 8 })
    expect(pose.scrub(0.9)).toMatchObject({ section: 2, step: 14 })
    expect(pose.scrub(0.1)).toMatchObject({ section: 2, step: 0 })
  })

  it("uses half-counts when Half counts is on", () => {
    const pose = posed(3, 1, true)
    expect(pose.scrub(0.3)).toMatchObject({ step: 4 })
    expect(pose.scrub(0.34)).toMatchObject({ step: 5 })
  })

  it("keeps the bar open", () => {
    const pose = posed(3)
    pose.aim()
    pose.tick(POSE_BAR_HIDE_SEC - 0.1)
    pose.scrub(0.5)
    expect(pose.tick(POSE_BAR_HIDE_SEC - 0.1).screen).toBe("E")
  })

  it("calls nothing while dragging, and the landing count once on release", () => {
    const pose = posed(3)
    const caller = new CountCaller()
    for (const f of [0.1, 0.3, 0.5, 0.7]) expect(caller.nextStep(pose.scrub(f))).toBe(0)
    expect(caller.nextStep(pose.scrubEnd())).toBe(6)
    expect(caller.nextStep(pose.view)).toBe(0)
  })

  it("calls \"&\" on release when it lands on a half-count", () => {
    const pose = posed(3, 1, true)
    const caller = new CountCaller()
    pose.scrub(0.34)
    expect(caller.nextStep(pose.scrubEnd())).toBe(AND_CALL)
  })

  it("calls the count again after a drag lands where it started", () => {
    const pose = posed(3)
    const caller = new CountCaller()
    pose.scrub(0.5)
    expect(caller.nextStep(pose.scrubEnd())).toBe(5)
    pose.scrub(0.1)
    pose.scrub(0.5)
    expect(caller.nextStep(pose.scrubEnd())).toBe(5)
  })
})

describe("Pose: Mirror", () => {
  it("is the same setting as Playthrough's, and carries between modes", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapMode()
    expect(pc.toggleMirror().settings.mirror).toBe(true)
    expect(pc.view.mode).toBe("Pose")
    pc.tapMode()
    expect(pc.view.settings.mirror).toBe(true)
    pc.tapMode()
    expect(pc.view.settings.mirror).toBe(true)
  })

  it("is kept into a Play from here run", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapMode()
    pc.toggleMirror()
    expect(pc.playFromHere(1, 4).settings.mirror).toBe(true)
  })
})

describe("Pose: Play from here", () => {
  /** Pose on section n, stepped to `step`, then Play from here. */
  function playFrom(n: number, step: number, speed: 0.5 | 0.75 | 1 = 1) {
    const pc = new PlaybackController(makeDance())
    pc.setSpeed(speed)
    runSection(pc, n)
    pc.tapMode()
    return { pc, v: pc.playFromHere(n, step) }
  }

  it("leaves Pose for Playthrough with the controls locked, at the current speed", () => {
    const { v } = playFrom(2, 4, 0.5)
    expect(v).toMatchObject({ mode: "Playthrough", controlsLocked: true, section: 2, runSection: 2, runStop: 2, runKind: "section", toast: null })
    expect(v.video.rate).toBe(0.5)
  })

  it("counts in over the 4 counts before the frozen count, dimmed", () => {
    // Section 2 starts at 5 s; count 3 is at 6 s; the 4 counts before it are 4 s to 6 s.
    const { pc, v } = playFrom(2, 4)
    expect(v).toMatchObject({ screen: "B0", countIn: { number: 5, kind: "leadIn" } })
    expect(v.video).toMatchObject({ seekTo: 4, playing: true, dim: true, runEnd: 9 })
    expect(pc.tick(4.1).countIn).toEqual({ number: 5, kind: "leadIn" })
    expect(pc.tick(4.6).countIn).toEqual({ number: 6, kind: "leadIn" })
    expect(pc.tick(5.1).countIn).toEqual({ number: 7, kind: "leadIn" })
    expect(pc.tick(5.6).countIn).toEqual({ number: 8, kind: "leadIn" })
  })

  it("plays from the frozen count: count 3 first, then on to the section's end", () => {
    const { pc } = playFrom(2, 4)
    expect(pc.tick(6.01)).toMatchObject({ screen: "B", countIn: null, count: 3, and: false, controlsLocked: true })
    expect(pc.view.video).toMatchObject({ playing: true, dim: false })
    expect(pc.tick(7.3)).toMatchObject({ count: 5, and: true })
    expect(pc.tick(8.9)).toMatchObject({ screen: "B", count: 8 })
  })

  it("ends on Clip ended for the section, unlocked", () => {
    const { pc } = playFrom(2, 4)
    for (let t = 4; t <= 9.1; t += 0.05) pc.tick(t, 0.05)
    expect(pc.view).toMatchObject({ screen: "C", controlsLocked: false, mode: "Playthrough", section: 2, count: 8 })
    expect(pc.view.doneSections).toContain(2)
  })

  it("starts a half-count step at its \"&\"", () => {
    // Step 5 is 2&, at 5 + 5 × 0.25 = 6.25 s.
    const { pc, v } = playFrom(2, 5)
    expect(v.video.seekTo).toBe(4.25)
    expect(pc.tick(6.3)).toMatchObject({ screen: "B", count: 3, and: true })
  })

  it("counts in from the frozen still when there's no footage that early", () => {
    // Section 1 starts at 1 s: only 2 s of footage before count 1, short of 4 counts.
    const { pc, v } = playFrom(1, 2)
    expect(v).toMatchObject({ screen: "BI", countIn: { number: 5, kind: "startingPose" } })
    expect(v.video).toMatchObject({ seekTo: 1.5, playing: false, dim: false })
    const after = holdPose(pc, 2.01)
    expect(after).toMatchObject({ screen: "B", countIn: null, count: 2 })
    expect(pc.view.video.playing).toBe(true)
  })

  it("from count 1 of Section 1 counts in like tapping it", () => {
    const { v } = playFrom(1, 0)
    expect(v).toMatchObject({ screen: "BI", countIn: { number: 5, kind: "startingPose" } })
  })

  it("leads in from the previous section's last counts for count 1 of a later section", () => {
    const { v } = playFrom(3, 0)
    expect(v).toMatchObject({ screen: "B0" })
    expect(v.video.seekTo).toBe(9 - 2)
  })

  it("is ignored outside Pose", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 2)
    expect(pc.playFromHere(2, 4)).toMatchObject({ screen: "C", mode: "Playthrough" })
  })

  it("replay afterwards runs the whole section again", () => {
    const { pc } = playFrom(2, 4)
    for (let t = 4; t <= 9.1; t += 0.05) pc.tick(t, 0.05)
    const v = pc.replay()
    expect(v.video.seekTo).toBe(3)
    expect(v.countIn).toEqual({ number: 5, kind: "leadIn" })
  })
})

describe("Dances without stills", () => {
  it("skips Pose with the toast and opens Lookback", () => {
    const pc = new PlaybackController(makeDance(), undefined, false)
    runSection(pc, 2)
    const v = pc.tapMode()
    expect(v).toMatchObject({ mode: "Lookback", screen: "I", section: 2, toast: NO_STILLS_TOAST, controlsLocked: false })
    expect(v.video.playing).toBe(false)
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "C", section: 2, toast: null })
  })

  it("stays in Playthrough with the toast when Lookback isn't available either", () => {
    const pc = new PlaybackController(makeDance(), undefined, false, false)
    runSection(pc, 2)
    expect(pc.tapMode()).toMatchObject({ mode: "Playthrough", screen: "C", toast: NO_STILLS_TOAST })
    expect(pc.tick(5, TOAST_SEC + 0.1).toast).toBeNull()
    expect(pc.replay()).toMatchObject({ mode: "Playthrough", section: 2 })
  })

  it("enters Pose once the dance has stills", () => {
    const pc = new PlaybackController(makeDance(), undefined, true)
    runSection(pc, 2)
    expect(pc.tapMode()).toMatchObject({ mode: "Pose", toast: null })
  })
})

describe("Bundled dance (no server)", () => {
  it("shows the server toast instead of entering Lookback, and returns to Clip ended", () => {
    const pc = new PlaybackController(makeDance(), undefined, true, false)
    runSection(pc, 2)
    expect(pc.tapMode().mode).toBe("Pose")
    const v = pc.tapMode()
    expect(v).toMatchObject({ mode: "Playthrough", screen: "C", section: 2, toast: NO_SERVER_TOAST })
    expect(NO_SERVER_TOAST).toBe("Lookback needs the dance server")
    expect(pc.tick(5, TOAST_SEC + 0.1).toast).toBeNull()
    expect(pc.tapMode().mode).toBe("Pose")
  })
})

describe("Pose edges", () => {
  it("steps through all 16 half-counts of a short last section", () => {
    const dance = makeDance({ trim: { start: 0, end: 11 } })
    const pc = new PlaybackController(dance)
    expect(pc.clock.sectionCount).toBe(3)
    runSection(pc, 3)
    const v = pc.tapMode()
    const pose = new PoseController()
    pose.enter(v.section, v.sectionCount, true)
    for (let i = 0; i < 15; i++) pose.stepForward()
    expect(pose.view).toMatchObject({ section: 3, step: 15 })
    expect(pose.stepForward()).toBe(pose.view)
    expect(pose.view.step).toBe(15)
  })

  it("steps and stops correctly in a one-section dance", () => {
    const dance = makeDance({ trim: { start: 0, end: 5 } })
    const pc = new PlaybackController(dance)
    expect(pc.clock.sectionCount).toBe(1)
    runSection(pc, 1)
    const v = pc.tapMode()
    const pose = new PoseController()
    pose.enter(v.section, v.sectionCount)
    expect(pose.stepBack().step).toBe(0)
    for (let i = 0; i < 7; i++) pose.stepForward()
    expect(pose.view.step).toBe(14)
    pose.stepForward()
    expect(pose.view).toMatchObject({ section: 1, step: 14 })
    expect(leavePose(pc)).toMatchObject({ mode: "Playthrough", section: 1 })
  })

  it("opens another dance in Playthrough, even after leaving the old one in Pose", () => {
    const first = new PlaybackController(makeDance())
    runSection(first, 2)
    expect(first.tapMode().mode).toBe("Pose")
    const second = new PlaybackController(makeDance({ id: "other" }))
    expect(second.view.mode).toBe("Playthrough")
    expect(second.open()).toMatchObject({ mode: "Playthrough", section: 1 })
  })
})
