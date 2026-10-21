import { describe, expect, it } from "vitest"
import { PlaybackController } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { makeDance } from "./fixtures"

describe("PlaybackController: playing Section 1", () => {
  it("seeks to the first beat, plays and locks the controls", () => {
    const pc = new PlaybackController(makeDance())
    const before = pc.view.video.seekId
    const v = pc.playSection(1)
    expect(v.screen).toBe("B")
    expect(v.controlsLocked).toBe(true)
    expect(v.video).toMatchObject({ seekTo: 1, playing: true, rate: 1 })
    expect(v.video.seekId).not.toBe(before)
  })

  it("follows the beat as the video plays", () => {
    const pc = new PlaybackController(makeDance())
    pc.playSection(1)
    expect(pc.tick(1.1)).toMatchObject({ count: 1, and: false })
    expect(pc.tick(2.8)).toMatchObject({ count: 4, and: true })
    expect(pc.tick(3).runProgress).toBeCloseTo(0.5)
  })

  it("stops at the end of count 8 on Clip ended, with controls unlocked and Section 1 ticked", () => {
    const pc = new PlaybackController(makeDance())
    pc.playSection(1)
    pc.tick(4.9)
    const v = pc.tick(5.02)
    expect(v.screen).toBe("C")
    expect(v.controlsLocked).toBe(false)
    expect(v.video.playing).toBe(false)
    expect(v.doneSections).toEqual([1])
  })

  it("doesn't replay by itself", () => {
    const pc = new PlaybackController(makeDance())
    pc.playSection(1)
    pc.tick(5.1)
    const seekId = pc.view.video.seekId
    expect(pc.tick(5.2)).toMatchObject({ screen: "C", video: { playing: false, seekId } })
  })

  it("plays at the saved speed", () => {
    const pc = new PlaybackController(makeDance(), { settings: { speed: 0.5, mirror: true, counts: true } })
    expect(pc.playSection(1).video.rate).toBe(0.5)
    expect(pc.view.settings.mirror).toBe(true)
  })
})
