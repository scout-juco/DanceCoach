import { describe, expect, it } from "vitest"
import { CountCaller } from "../DanceCoachLens/Assets/Scripts/Core/CountCaller"
import { PlaybackController } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { makeDance } from "./fixtures"

// The fixture: 120 bpm (a count is 0.5 s, a section 4 s), first beat at 1 s, sections at 1, 5 and 9 s.

/** Plays from `from` to `to` seconds in small frames, collecting every number called. */
function calls(pc: PlaybackController, caller: CountCaller, from: number, to: number, frame = 0.05): number[] {
  const said: number[] = []
  for (let t = from; t <= to + 1e-9; t += frame) {
    const n = caller.next(pc.tick(t, frame))
    if (n) said.push(n)
  }
  return said
}

/** Holds a frozen starting pose for `seconds`, collecting every number called. */
function poseCalls(pc: PlaybackController, caller: CountCaller, seconds: number, frame = 0.05): number[] {
  const said: number[] = []
  for (let t = 0; t < seconds - 1e-9; t += frame) {
    const n = caller.next(pc.tick(pc.view.video.seekTo, frame))
    if (n) said.push(n)
  }
  return said
}

const seen = { firstLookSeen: true }

describe("CountCaller", () => {
  it("calls the count-in and then every count of the section, once each", () => {
    const pc = new PlaybackController(makeDance(), seen)
    const caller = new CountCaller()
    pc.tapSection(2)
    expect(calls(pc, caller, 3, 9.1)).toEqual([5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it("calls the count-in over a frozen starting pose", () => {
    const pc = new PlaybackController(makeDance(), seen)
    const caller = new CountCaller()
    pc.tapSection(1)
    expect(poseCalls(pc, caller, 2.1)).toEqual([5, 6, 7, 8, 1])
  })

  it("calls only the count-in when Counts is off", () => {
    const pc = new PlaybackController(makeDance(), { ...seen, settings: { speed: 1, mirror: false, counts: false } })
    const caller = new CountCaller()
    pc.tapSection(2)
    expect(calls(pc, caller, 3, 9.1)).toEqual([5, 6, 7, 8])
  })

  it("is silent on Clip ended, and calls a replay's count-in again", () => {
    const pc = new PlaybackController(makeDance(), seen)
    const caller = new CountCaller()
    pc.tapSection(2)
    calls(pc, caller, 3, 9.1)
    expect(pc.view.screen).toBe("C")
    expect(caller.next(pc.tick(9.2))).toBe(0)
    pc.replay()
    expect(calls(pc, caller, 3, 5.1)).toEqual([5, 6, 7, 8, 1])
  })

  it("counts each section from 1 when runs chain sections", () => {
    const pc = new PlaybackController(makeDance(), seen)
    const caller = new CountCaller()
    pc.tapSection("full")
    const said = [...poseCalls(pc, caller, 2.1), ...calls(pc, caller, 1, 13.1)]
    expect(said).toEqual([5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it("calls the counts through the first look, from Section 1", () => {
    const pc = new PlaybackController(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } }))
    const caller = new CountCaller()
    expect(caller.next(pc.open())).toBe(0)
    expect(calls(pc, caller, 1, 6.9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
