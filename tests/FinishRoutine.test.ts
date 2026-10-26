import { describe, expect, it } from "vitest"
import { PlaybackController, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { PopupFollow } from "../DanceCoachLens/Assets/Scripts/UI/PopupFollow"
import { makeDance } from "./fixtures"

// The fixture: 120 bpm (a count is 0.5 s, a section 4 s), first beat at 1 s, sections at 1, 5 and 9 s.

function holdPose(pc: PlaybackController, seconds: number, frame = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += frame) pc.tick(pc.view.video.seekTo, Math.min(frame, seconds - t))
}

/** Plays the run in progress to its end: its pose count-in if any, then the video. */
function finishRun(pc: PlaybackController): ViewState {
  const first = pc.view.runKind === "section" ? pc.view.section : 1
  if (pc.view.screen === "BI") holdPose(pc, 2)
  for (let t = pc.clock.sectionStart(first) - 2; t <= pc.clock.sectionEnd(pc.view.runStop) + 0.1; t += 0.05) pc.tick(t, 0.05)
  return pc.view
}

const runSection = (pc: PlaybackController, n: number) => (pc.tapSection(n), finishRun(pc))

describe("Finish routine unlock", () => {
  it("starts locked, and a click says when it unlocks", () => {
    const pc = new PlaybackController(makeDance())
    expect(pc.view.finishReady).toBe(false)
    expect(pc.finish()).toMatchObject({ screen: "C", popup: null, toast: "Finish routine unlocks after you finish Section 3" })
  })

  it("stays locked through the sections before the last", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 1)
    expect(runSection(pc, 2)).toMatchObject({ screen: "C", finishReady: false })
  })

  it("unlocks quietly when the last section ends: Clip ended becomes C2, no pop-up", () => {
    const pc = new PlaybackController(makeDance())
    expect(runSection(pc, 3)).toMatchObject({ screen: "C2", finishReady: true, popup: null, controlsLocked: false })
  })

  it("unlocks after From the top through the last section", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 3)
    const fresh = new PlaybackController(makeDance())
    runSection(fresh, 2)
    fresh.fromTheTop()
    expect(finishRun(fresh)).toMatchObject({ screen: "C", finishReady: false })
    runSection(pc, 3)
    pc.fromTheTop()
    expect(finishRun(pc)).toMatchObject({ screen: "C2", finishReady: true })
  })

  it("unlocks after Full", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapSection("full")
    expect(finishRun(pc)).toMatchObject({ screen: "C2", finishReady: true, popup: null })
  })

  it("doesn't unlock from the first look", () => {
    const pc = new PlaybackController(makeDance())
    pc.open()
    for (let t = 1; t <= 13.1; t += 0.05) pc.tick(t, 0.05)
    expect(pc.view.finishReady).toBe(false)
  })

  it("unlocks after a partial last section that ends with the footage", () => {
    const pc = new PlaybackController(makeDance({ trim: { start: 0, end: 14.5 } }))
    expect(runSection(pc, 4)).toMatchObject({ screen: "C2", finishReady: true, count: 3 })
  })

  it("stays unlocked when an earlier section is run again", () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 3)
    expect(runSection(pc, 1)).toMatchObject({ screen: "C2", finishReady: true })
  })

  it("restores unlocked from saved progress", () => {
    const pc = new PlaybackController(makeDance(), { finishReady: true })
    expect(pc.view.finishReady).toBe(true)
    runSection(pc, 1)
    expect(pc.view).toMatchObject({ screen: "C2", finishReady: true })
  })

  it("is ignored while a run plays", () => {
    const pc = new PlaybackController(makeDance(), { finishReady: true })
    pc.tapSection(2)
    expect(pc.finish()).toMatchObject({ popup: null, controlsLocked: true })
  })
})

describe("Routine done", () => {
  const ready = () => {
    const pc = new PlaybackController(makeDance())
    runSection(pc, 3)
    return pc
  }

  it("opens over the dimmed video with the controls locked", () => {
    const v = ready().finish()
    expect(v).toMatchObject({ screen: "G", popup: "routineDone", controlsLocked: true, video: { playing: false, dim: true } })
  })

  it("ignores board commands behind it", () => {
    const pc = ready()
    pc.finish()
    for (const v of [pc.tapSection(1), pc.replay(), pc.fromTheTop(), pc.setSpeed(0.5), pc.finish()]) expect(v).toMatchObject({ screen: "G", popup: "routineDone" })
  })

  it("Run it again plays From the top over the full routine", () => {
    const pc = ready()
    pc.finish()
    const v = pc.routineDone("again")
    expect(v).toMatchObject({ screen: "BI", runKind: "top", runSection: 1, runStop: 3, popup: null, controlsLocked: true, finishReady: true })
    expect(v.video.dim).toBe(false)
    expect(finishRun(pc)).toMatchObject({ screen: "C2", runStop: 3 })
  })

  it.each(["practice", "back"] as const)("%s closes it and returns to Clip ended with the controls unlocked", (choice) => {
    const pc = ready()
    pc.finish()
    const v = pc.routineDone(choice)
    expect(v).toMatchObject({ screen: "C2", popup: null, controlsLocked: false, finishReady: true, video: { dim: false, playing: false } })
    expect(pc.replay()).toMatchObject({ runKind: "section", section: 3 })
  })

  it("ignores a choice without the pop-up", () => {
    const pc = ready()
    expect(pc.routineDone("again")).toMatchObject({ screen: "C2", popup: null })
  })
})

describe("Pop-up follow", () => {
  const deg = (d: number) => (d * Math.PI) / 180

  it("stays put while you look around within 30°", () => {
    const f = new PopupFollow()
    f.open(deg(10))
    for (let i = 0; i < 30; i++) expect(f.step(deg(10 + 29), 1 / 30)).toBe(0)
    expect(f.yaw).toBeCloseTo(deg(10))
  })

  it("glides back in front once you turn more than 30° away", () => {
    const f = new PopupFollow()
    f.open(0)
    f.step(deg(31), 1 / 30)
    expect(f.yaw).toBeGreaterThan(0)
    for (let i = 0; i < 120; i++) f.step(deg(31), 1 / 30)
    expect(Math.abs(f.yaw - deg(31))).toBeLessThan(deg(2))
  })

  it("takes the short way round the circle", () => {
    const f = new PopupFollow()
    f.open(deg(170))
    f.step(deg(-150), 1 / 30)
    expect(f.yaw).toBeGreaterThan(deg(170))
  })
})
