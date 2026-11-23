import { describe, expect, it } from "vitest"
import { LookbackController, originalHead, scrubCount, TAKE_HEAD, takeLabel } from "../DanceCoachLens/Assets/Scripts/Core/LookbackController"
import { Take } from "../DanceCoachLens/Assets/Scripts/Core/TakesClient"

const take = (number: number, speed = 0.75): Take => ({ name: `s2-t${number}`, section: 2, speed, mirror: false, number })

// Section 2 runs from 10 s to 14 s of the original: 8 counts of 0.5 s.
const SETUP = { start: 10, end: 14, beatSec: 0.5 }
const RANGE = { start: 10, end: 14 }

/** Lookback on L with two takes (the second selected) and the phone connected. */
function onL() {
  const lb = new LookbackController()
  lb.enter(2, [take(1, 1), take(2, 0.75)])
  lb.phoneStatus(true)
  return lb
}

/** Through Play side by side and the take loading: on M, count 1, paused, still seeking. */
function onM() {
  const lb = onL()
  lb.playSideBySide(SETUP)
  lb.takeRequests()
  lb.takeLoaded(take(2, 0.75))
  return lb
}

/** On M with both videos landed on count 1. */
function landed() {
  const lb = onM()
  lb.landed()
  return lb
}

const sbs = (lb: LookbackController) => lb.view!.sideBySide!

describe("opening side by side (screen M)", () => {
  it("asks for the selected take's video, and stays on L until it has loaded", () => {
    const lb = onL()
    expect(lb.playSideBySide(SETUP)).toMatchObject({ screen: "L" })
    expect(lb.takeRequests()).toEqual([{ type: "load", take: take(2, 0.75) }])
  })

  it("opens on count 1, paused, with both clips sent to count 1", () => {
    const v = sbs(onM())
    expect(v).toMatchObject({ count: 1, fraction: 0, playing: false, seeking: true, speed: 0.75 })
    expect(v.originalClip).toMatchObject({ seekTo: 10, playing: false })
    expect(v.takeClip).toMatchObject({ seekTo: 0, playing: false })
    expect(onM().view!.screen).toBe("M")
  })

  it("opens at the speed the take was filmed at: the original at it and the take at 1×", () => {
    const v = sbs(onM())
    expect(v.originalClip.rate).toBeCloseTo(0.75)
    expect(v.takeClip.rate).toBe(1)
  })

  it("loads the take that was selected in the takes row", () => {
    const lb = onL()
    lb.selectTake(0)
    lb.playSideBySide(SETUP)
    expect(lb.takeRequests()).toEqual([{ type: "load", take: take(1, 1) }])
  })

  it("is ignored without takes, mid-load, and off L", () => {
    const empty = new LookbackController()
    empty.enter(2, [])
    empty.playSideBySide(SETUP)
    expect(empty.takeRequests()).toEqual([])
    const lb = onL()
    lb.playSideBySide(SETUP)
    lb.playSideBySide(SETUP)
    expect(lb.takeRequests()).toHaveLength(1)
    lb.tapRecord(1, false, RANGE)
    lb.takeLoaded(take(2, 0.75))
    expect(lb.view!.screen).toBe("J")
  })

  it("goes back to L with a message when the take can't be loaded", () => {
    const lb = onL()
    lb.playSideBySide(SETUP)
    expect(lb.takeLoadFailed("Couldn't load the take")).toMatchObject({ screen: "L", message: "Couldn't load the take", selected: 1 })
  })

  it("labels the two videos", () => {
    expect(originalHead(false)).toBe("ORIGINAL")
    expect(originalHead(true)).toBe("ORIGINAL · MIRRORED")
    expect(TAKE_HEAD).toBe("YOU · LOOKBACK FROM PHONE")
    expect(takeLabel(take(2, 0.75))).toBe("TAKE 2 · 0.75×")
  })
})

describe("play and pause", () => {
  it("holds both clips until they have both landed, then plays them together from count 1", () => {
    const lb = onM()
    lb.togglePlay()
    expect(sbs(lb)).toMatchObject({ playing: true, seeking: true })
    expect(sbs(lb).originalClip.playing).toBe(false)
    expect(sbs(lb).takeClip.playing).toBe(false)
    lb.landed()
    expect(sbs(lb).originalClip).toMatchObject({ playing: true, seekTo: 10 })
    expect(sbs(lb).takeClip).toMatchObject({ playing: true, seekTo: 0 })
  })

  it("keeps the seek ids still while playing, so neither clip restarts", () => {
    const lb = landed()
    lb.togglePlay()
    const { originalClip, takeClip } = sbs(lb)
    lb.tick(0.1, 11.1)
    expect(sbs(lb).originalClip.seekId).toBe(originalClip.seekId)
    expect(sbs(lb).takeClip.seekId).toBe(takeClip.seekId)
  })

  it("follows the original's time through the counts", () => {
    const lb = landed()
    lb.togglePlay()
    lb.tick(0.1, 10.1)
    expect(sbs(lb)).toMatchObject({ count: 1 })
    lb.tick(0.1, 11.2)
    expect(sbs(lb).count).toBe(3)
    lb.tick(0.1, 13.9)
    expect(sbs(lb).count).toBe(8)
    expect(sbs(lb).fraction).toBeCloseTo(0.975)
  })

  it("pauses both, and plays on from where it was", () => {
    const lb = landed()
    lb.togglePlay()
    lb.tick(0.1, 12.1)
    lb.togglePlay()
    expect(sbs(lb)).toMatchObject({ playing: false, count: 5 })
    expect(sbs(lb).originalClip.playing).toBe(false)
    expect(sbs(lb).takeClip.playing).toBe(false)
    const id = sbs(lb).originalClip.seekId
    lb.togglePlay()
    expect(sbs(lb)).toMatchObject({ playing: true, seeking: false })
    expect(sbs(lb).originalClip).toMatchObject({ playing: true, seekId: id })
  })

  it("stops both on the last count when the section ends, and plays again from count 1", () => {
    const lb = landed()
    lb.togglePlay()
    lb.tick(0.1, 14)
    expect(sbs(lb)).toMatchObject({ playing: false, count: 8, fraction: 1 })
    lb.togglePlay()
    expect(sbs(lb)).toMatchObject({ playing: true, seeking: true, count: 1 })
    expect(sbs(lb).originalClip).toMatchObject({ seekTo: 10, playing: false })
  })

  it("ticks nothing while a seek is under way or paused", () => {
    const lb = onM()
    lb.tick(0.1, 12)
    expect(sbs(lb).count).toBe(1)
    lb.landed()
    lb.tick(0.1, 12)
    expect(sbs(lb).count).toBe(1)
  })
})

describe("scrub", () => {
  it("snaps to the 8 counts", () => {
    expect([0, 0.1, 0.124, 0.126, 0.5, 0.99, 1].map((f) => scrubCount(f))).toEqual([1, 1, 1, 2, 5, 8, 8])
    expect(scrubCount(-1)).toBe(1)
    expect(scrubCount(2)).toBe(8)
  })

  it("pauses both and shows the count while dragging, without seeking yet", () => {
    const lb = landed()
    lb.togglePlay()
    const id = sbs(lb).originalClip.seekId
    lb.scrub(0.55)
    expect(sbs(lb)).toMatchObject({ count: 5, playing: false })
    expect(sbs(lb).originalClip).toMatchObject({ playing: false, seekId: id })
    lb.scrub(0.8)
    expect(sbs(lb).count).toBe(7)
  })

  it("seeks both to the count's time on release, the take's scaled by its speed", () => {
    const lb = landed()
    lb.scrub(0.55)
    lb.scrubEnd()
    const v = sbs(lb)
    // Count 5 is 4 counts = 2 s into the section; the take, filmed at 0.75×, is 2 / 0.75 s in.
    expect(v.originalClip.seekTo).toBeCloseTo(12)
    expect(v.takeClip.seekTo).toBeCloseTo(2 / 0.75)
    expect(v).toMatchObject({ seeking: true, playing: false, count: 5 })
    expect(v.originalClip.seekId).toBe(v.takeClip.seekId)
    lb.landed()
    expect(sbs(lb).originalClip.playing).toBe(false)
  })

  it("moves the bar's marker to the count", () => {
    const lb = landed()
    lb.scrub(0.55)
    expect(sbs(lb).fraction).toBeCloseTo(4 / 8)
  })

  it("starts a fresh seek each time, so a clip never sees the same id twice", () => {
    const lb = landed()
    lb.scrub(0.3)
    lb.scrubEnd()
    const first = sbs(lb).originalClip.seekId
    lb.landed()
    lb.scrub(0.3)
    lb.scrubEnd()
    expect(sbs(lb).originalClip.seekId).not.toBe(first)
    const again = onM()
    expect(sbs(again).originalClip.seekId).toBeGreaterThan(0)
  })
})

describe("speed", () => {
  it("cycles up through 0.5×, 0.75× and 1× of the real tempo, from where it opened", () => {
    const lb = landed()
    const seen: number[] = []
    for (let i = 0; i < 4; i++) seen.push(lb.cycleSpeed()!.sideBySide!.speed)
    expect(seen).toEqual([1, 0.5, 0.75, 1])
  })

  it("speeds a slow take up to the real tempo: the original at 1× and the take faster", () => {
    const lb = landed()
    lb.cycleSpeed()
    expect(sbs(lb).originalClip.rate).toBe(1)
    expect(sbs(lb).takeClip.rate).toBeCloseTo(1 / 0.75)
    lb.cycleSpeed()
    expect(sbs(lb).originalClip.rate).toBe(0.5)
    expect(sbs(lb).takeClip.rate).toBeCloseTo(0.5 / 0.75)
    lb.cycleSpeed()
    expect(sbs(lb).originalClip.rate).toBe(0.75)
    expect(sbs(lb).takeClip.rate).toBe(1)
  })

  it("restarts both on the count they're on, since a rate only applies when a clip starts", () => {
    const lb = landed()
    lb.scrub(0.55)
    lb.scrubEnd()
    lb.landed()
    const id = sbs(lb).originalClip.seekId
    lb.cycleSpeed()
    const v = sbs(lb)
    expect(v.originalClip.seekId).not.toBe(id)
    expect(v).toMatchObject({ count: 5, seeking: true })
    expect(v.originalClip.seekTo).toBeCloseTo(12)
    expect(v.takeClip.seekTo).toBeCloseTo(2 / 0.75)
  })

  it("carries on playing after the restart", () => {
    const lb = landed()
    lb.togglePlay()
    lb.cycleSpeed()
    expect(sbs(lb).playing).toBe(true)
    expect(sbs(lb).originalClip.playing).toBe(false)
    lb.landed()
    expect(sbs(lb).originalClip.playing).toBe(true)
    expect(sbs(lb).takeClip.playing).toBe(true)
  })

  it("keeps the speed and the clips' times for a take filmed at 1×", () => {
    const lb = onL()
    lb.selectTake(0)
    lb.playSideBySide(SETUP)
    lb.takeRequests()
    lb.takeLoaded(take(1, 1))
    lb.cycleSpeed()
    expect(sbs(lb).originalClip.rate).toBe(0.5)
    expect(sbs(lb).takeClip.rate).toBe(0.5)
  })
})

describe("Record again and Back to takes", () => {
  it("Record again opens J over L, and Not now goes back to L", () => {
    const lb = landed()
    expect(lb.recordAgain(0.75, true, RANGE)).toMatchObject({ screen: "J", sideBySide: null, record: { phase: "confirm", speed: 0.75, mirror: true } })
    expect(lb.cancel()).toMatchObject({ screen: "L", selected: 1 })
  })

  it("Back to takes returns to L with the take still selected", () => {
    const lb = landed()
    expect(lb.backToTakes()).toMatchObject({ screen: "L", selected: 1, sideBySide: null })
  })

  it("starts again from count 1 at the take's speed next time", () => {
    const lb = landed()
    lb.cycleSpeed()
    lb.backToTakes()
    lb.playSideBySide(SETUP)
    lb.takeRequests()
    lb.takeLoaded(take(2, 0.75))
    expect(sbs(lb)).toMatchObject({ count: 1, speed: 0.75, playing: false })
  })

  it("keeps side by side across a late takes listing, and leaves it with Lookback", () => {
    const lb = landed()
    expect(lb.setTakes([take(1, 1), take(2, 0.75)])).toMatchObject({ screen: "M", selected: 1 })
    lb.leave()
    expect(lb.view).toBeNull()
    expect(lb.takeRequests()).toEqual([])
  })
})
