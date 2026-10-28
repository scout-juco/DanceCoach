import { describe, expect, it } from "vitest"
import { PlaybackController } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { makeDance } from "./fixtures"

// The fixture: 120 bpm (a count is 0.5 s, a section 4 s), first beat at 1 s, sections at 1, 5 and 9 s.

/** Plays the current run from its count-in to its end. */
function finishRun(pc: PlaybackController) {
  for (let i = 0; i < 80; i++) pc.tick(0, 0.05)
  const first = pc.view.section
  for (let t = pc.clock.sectionStart(first) - 2; t <= pc.clock.sectionEnd(pc.view.runStop) + 0.1; t += 0.05) pc.tick(t, 0.05)
}

describe("Playing a range of sections", () => {
  it("runs from the start of the first section through the end of the last, with the first's count-in", () => {
    const pc = new PlaybackController(makeDance())
    const v = pc.tapRange(2, 3)
    expect(v).toMatchObject({ runKind: "section", section: 2, runStop: 3, runSection: 2, controlsLocked: true })
    const mid = pc.tick(pc.clock.sectionStart(3) + 1, 0.05)
    expect(mid).toMatchObject({ runSection: 3 })
  })

  it("ticks every section in the range when it ends", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapRange(1, 2)
    finishRun(pc)
    expect(pc.view).toMatchObject({ controlsLocked: false, doneSections: [1, 2] })
  })

  it("replays the range, and From the top stops at the end of it", () => {
    const pc = new PlaybackController(makeDance())
    pc.tapRange(1, 2)
    finishRun(pc)
    expect(pc.replay()).toMatchObject({ runKind: "section", section: 1, runStop: 2 })
    finishRun(pc)
    expect(pc.fromTheTop()).toMatchObject({ runKind: "top", runStop: 2 })
  })

  it("treats a backwards range the same way, and a range of one as a section", () => {
    const pc = new PlaybackController(makeDance())
    expect(pc.tapRange(3, 2)).toMatchObject({ section: 2, runStop: 3 })
    finishRun(pc)
    expect(pc.tapRange(2, 2)).toMatchObject({ section: 2, runStop: 2 })
  })
})
