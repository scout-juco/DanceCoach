import { describe, expect, it } from "vitest"
import { CountClock } from "../DanceCoachLens/Assets/Scripts/Core/CountClock"
import {
  COUNTDOWN_FROM,
  LookbackController,
  MESSAGE_SEC,
  PHONE_STOPPED_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_TIMEOUT_SEC,
  scrubCount,
  sectionCounts,
  UNREACHABLE_MESSAGE,
} from "../DanceCoachLens/Assets/Scripts/Core/LookbackController"
import { PlaybackController } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { RecorderSession, Take } from "../DanceCoachLens/Assets/Scripts/Core/TakesClient"
import { makeDance } from "./fixtures"

const take = (number: number, section = 2, speed = 1): Take => ({ name: `s${section}-t${number}`, section, speed, mirror: false, number })
const takes = (n: number, section = 2) => Array.from({ length: n }, (_, i) => take(i + 1, section))
const RANGE = { start: 10, end: 18 }

function onJ(section = 2, existing = 0) {
  const lb = new LookbackController()
  lb.enter(section, takes(existing, section))
  lb.phoneStatus(true)
  lb.tapRecord(1, false, RANGE)
  return lb
}
const counting = () => {
  const lb = onJ()
  lb.confirm()
  lb.armed("s9")
  lb.takeRequests()
  return lb
}
const recording = () => {
  const lb = counting()
  lb.tick(COUNTDOWN_FROM)
  lb.takeRequests()
  return lb
}
const saving = () => {
  const lb = recording()
  lb.tick(0.1, RANGE.end)
  lb.takeRequests()
  return lb
}
const session = (state: RecorderSession["state"], extra: Partial<RecorderSession> = {}): RecorderSession => ({ id: "s9", state, ...extra })

describe("edge: the phone disconnects", () => {
  it("blocks recording on J until it is connected", () => {
    const lb = new LookbackController()
    lb.enter(2, [])
    lb.tapRecord(1, false, RANGE)
    expect(lb.confirm()).toMatchObject({ screen: "J" })
    expect(lb.takeRequests()).toEqual([])
  })

  it("lets K finish, then fails the take with 'The phone stopped filming' when the phone is gone at the end", () => {
    const lb = recording()
    lb.recorderStatus({ phoneConnected: false, session: session("recording") })
    expect(lb.view!.screen).toBe("K")
    lb.tick(0.1, RANGE.end)
    expect(lb.view!.record!.phase).toBe("saving")
    expect(lb.recorderStatus({ phoneConnected: false, session: session("uploading") })).toMatchObject({ screen: "I", record: null, message: PHONE_STOPPED_MESSAGE })
    expect(PHONE_STOPPED_MESSAGE).toBe("The phone stopped filming. Record again?")
  })

  it("fails with the server's reason when it already knows the phone went quiet", () => {
    const lb = saving()
    expect(lb.recorderStatus({ phoneConnected: false, session: session("failed", { reason: PHONE_STOPPED_MESSAGE }) })!.message).toBe(PHONE_STOPPED_MESSAGE)
  })

  it("doesn't fail a take whose recording reached the server before the phone left", () => {
    const lb = saving()
    lb.recorderStatus({ phoneConnected: false, session: session("processing") })
    expect(lb.view!.record!.phase).toBe("saving")
    lb.recorderStatus({ phoneConnected: false, session: session("ready", { take: take(1) }) })
    expect(lb.takeRequests()).toEqual([{ type: "download", take: take(1) }])
  })

  it("goes back to L with the takes still there, and the lens can record again", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(2))
    lb.phoneStatus(true)
    lb.tapRecord(1, false, RANGE)
    lb.confirm()
    lb.armed("s9")
    lb.tick(COUNTDOWN_FROM)
    lb.tick(0.1, RANGE.end)
    lb.recorderStatus({ phoneConnected: false, session: session("uploading") })
    expect(lb.view).toMatchObject({ screen: "L", selected: 1, message: PHONE_STOPPED_MESSAGE })
    expect(lb.tapRecord(1, false, RANGE)!.screen).toBe("J")
  })
})

describe("edge: an upload or process fails or times out", () => {
  it("shows the server's reason for a failed process", () => {
    expect(saving().recorderStatus({ phoneConnected: true, session: session("failed", { reason: "We couldn't read that recording. Try again." }) })).toMatchObject({
      screen: "I",
      message: "We couldn't read that recording. Try again.",
    })
  })

  it("gives up after the save timeout, with a message", () => {
    const lb = saving()
    lb.recorderStatus({ phoneConnected: true, session: session("processing") })
    lb.tick(SAVE_TIMEOUT_SEC)
    expect(lb.view).toMatchObject({ screen: "I", message: SAVE_TIMEOUT_MESSAGE })
  })

  it("gives up on a take that can't be downloaded, and stays usable", () => {
    const lb = saving()
    lb.recorderStatus({ phoneConnected: true, session: session("ready", { take: take(1) }) })
    expect(lb.downloadFailed("Couldn't download the take: HTTP 500")).toMatchObject({ screen: "I", message: "Couldn't download the take: HTTP 500" })
    expect(lb.tapRecord(1, false, RANGE)!.screen).toBe("J")
  })

  it("ignores a late 'ready' from a take it already gave up on", () => {
    const lb = saving()
    lb.tick(SAVE_TIMEOUT_SEC)
    lb.recorderStatus({ phoneConnected: true, session: session("ready", { take: take(1) }) })
    expect(lb.takeRequests()).toEqual([])
    expect(lb.view!.takes).toEqual([])
  })
})

describe("edge: the server can't be reached in Lookback", () => {
  it("says so on I and on L, and clears the message once it is reachable again", () => {
    const lb = new LookbackController()
    lb.enter(2, [])
    expect(lb.serverUnreachable()).toMatchObject({ screen: "I", message: UNREACHABLE_MESSAGE, phoneConnected: false })
    lb.tick(MESSAGE_SEC)
    expect(lb.view!.message).toBeNull()
    lb.setTakes(takes(2))
    expect(lb.serverUnreachable()).toMatchObject({ screen: "L", message: UNREACHABLE_MESSAGE })
  })

  it("keeps the message up while polls keep failing", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(1))
    for (let i = 0; i < 20; i++) {
      lb.serverUnreachable()
      lb.tick(1)
    }
    expect(lb.view!.message).toBe(UNREACHABLE_MESSAGE)
  })

  it("fails a take that hasn't started playing", () => {
    expect(counting().serverUnreachable()).toMatchObject({ screen: "I", record: null, message: UNREACHABLE_MESSAGE })
    const arming = onJ()
    arming.confirm()
    expect(arming.serverUnreachable()).toMatchObject({ screen: "I", message: UNREACHABLE_MESSAGE })
  })

  it("lets a take that is playing carry on", () => {
    expect(recording().serverUnreachable()).toMatchObject({ screen: "K", message: null })
    expect(saving().serverUnreachable()).toMatchObject({ screen: "K" })
  })

  it("leaves J up, and Not now still works", () => {
    const lb = onJ()
    expect(lb.serverUnreachable()).toMatchObject({ screen: "J", phoneConnected: false })
    expect(lb.cancel()!.screen).toBe("I")
  })

  it("keeps the selected take through a failed poll, and still opens side by side", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(3))
    lb.serverUnreachable()
    expect(lb.view).toMatchObject({ screen: "L", selected: 2 })
    expect(lb.playSideBySide({ start: 10, end: 14, beatSec: 0.5 })).toMatchObject({ screen: "L" })
    expect(lb.takeRequests()).toEqual([{ type: "load", take: take(3) }])
  })

  it("comes back to L when a take's video can't be loaded", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(2))
    lb.playSideBySide({ start: 10, end: 14, beatSec: 0.5 })
    expect(lb.takeLoadFailed("Couldn't load the take: HTTP 404")).toMatchObject({ screen: "L", message: "Couldn't load the take: HTTP 404", selected: 1 })
  })
})

describe("edge: picking another dance while in Lookback", () => {
  it("leaves Lookback with nothing pending, and the new dance opens in Playthrough", () => {
    const first = new PlaybackController(makeDance({ id: "a" }), undefined, true, true)
    expect(first.selectMode("Lookback").mode).toBe("Lookback")
    const lb = new LookbackController()
    lb.enter(1, takes(1, 1))
    lb.phoneStatus(true)
    lb.tapRecord(1, false, RANGE)
    lb.confirm()
    // The Lens swaps the dance: Lookback is left and a fresh controller is made.
    lb.leave()
    const second = new PlaybackController(makeDance({ id: "b" }), undefined, true, true)
    expect(lb.view).toBeNull()
    expect(lb.takeRequests()).toEqual([])
    expect(lb.tick(5)).toBe(false)
    expect(lb.armed("s9")).toBeNull()
    expect(second.view.mode).toBe("Playthrough")
  })
})

describe("edge: a short last section", () => {
  // 120 bpm, first beat at 1 s, footage to 10.5 s: sections at 1, 5 and 9 s, the last only 3 counts (1.5 s).
  const dance = makeDance({ trim: { start: 0, end: 10.5 } })
  const clock = new CountClock(dance)

  it("has fewer than 8 counts, ending with the footage", () => {
    expect(clock.sectionCount).toBe(3)
    expect(clock.sectionEnd(3) - clock.sectionStart(3)).toBeCloseTo(1.5)
    expect(sectionCounts(clock.sectionStart(3), clock.sectionEnd(3), clock.beatSec)).toBe(3)
    expect(sectionCounts(clock.sectionStart(2), clock.sectionEnd(2), clock.beatSec)).toBe(8)
  })

  it("records over exactly the section's range and finishes when the footage's end is reached", () => {
    const lb = new LookbackController()
    lb.enter(3, [])
    lb.phoneStatus(true)
    lb.tapRecord(1, false, { start: clock.sectionStart(3), end: clock.sectionEnd(3) })
    lb.confirm()
    lb.armed("s9")
    lb.tick(COUNTDOWN_FROM)
    lb.tick(0.1, clock.sectionStart(3) + 0.75)
    expect(lb.view!.record!.progress).toBeCloseTo(0.5)
    lb.tick(0.1, clock.sectionEnd(3))
    expect(lb.view!.record!.phase).toBe("saving")
  })

  const setup = { start: clock.sectionStart(3), end: clock.sectionEnd(3), beatSec: clock.beatSec }
  const onM = () => {
    const lb = new LookbackController()
    lb.enter(3, takes(1, 3))
    lb.playSideBySide(setup)
    lb.takeRequests()
    lb.takeLoaded(take(1, 3))
    lb.landed()
    return lb
  }

  it("side by side has only the section's counts to scrub to", () => {
    const lb = onM()
    expect(lb.view!.sideBySide!.counts).toBe(3)
    expect([0, 0.33, 0.34, 0.67, 1].map((f) => scrubCount(f, 3))).toEqual([1, 1, 2, 3, 3])
    lb.scrub(1)
    expect(lb.view!.sideBySide).toMatchObject({ count: 3, fraction: 2 / 3 })
    lb.scrubEnd()
    // Count 3 is 1 s into the section, inside the 1.5 s take: never past its end.
    expect(lb.view!.sideBySide!.takeClip.seekTo).toBeCloseTo(1)
    expect(lb.view!.sideBySide!.originalClip.seekTo).toBeCloseTo(setup.start + 1)
  })

  it("plays through and stops on the last count, then plays again from count 1", () => {
    const lb = onM()
    lb.togglePlay()
    lb.tick(0.1, setup.start + 0.6)
    expect(lb.view!.sideBySide!.count).toBe(2)
    lb.tick(0.1, setup.end)
    expect(lb.view!.sideBySide).toMatchObject({ playing: false, count: 3, fraction: 1 })
    lb.togglePlay()
    expect(lb.view!.sideBySide).toMatchObject({ count: 1, playing: true, seeking: true })
  })

  it("a full section still has 8", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(1))
    lb.playSideBySide({ start: 5, end: 9, beatSec: 0.5 })
    lb.takeLoaded(take(1))
    expect(lb.view!.sideBySide!.counts).toBe(8)
  })
})

describe("edge: a one-section dance", () => {
  const dance = makeDance({ trim: { start: 0, end: 5 } })
  const clock = new CountClock(dance)

  it("has one section, and Lookback records and plays it side by side", () => {
    expect(clock.sectionCount).toBe(1)
    const pc = new PlaybackController(dance, undefined, true, true)
    expect(pc.selectMode("Lookback")).toMatchObject({ mode: "Lookback", section: 1 })
    const lb = new LookbackController()
    lb.enter(1, [])
    lb.phoneStatus(true)
    lb.tapRecord(1, false, { start: clock.sectionStart(1), end: clock.sectionEnd(1) })
    lb.confirm()
    lb.armed("s9")
    lb.tick(COUNTDOWN_FROM)
    lb.tick(0.1, clock.sectionEnd(1))
    lb.takeRequests()
    lb.recorderStatus({ phoneConnected: true, session: session("ready", { take: take(1, 1) }) })
    lb.downloaded(take(1, 1))
    expect(lb.view).toMatchObject({ screen: "L", section: 1, selected: 0, newTake: "s1-t1" })
    lb.playSideBySide({ start: clock.sectionStart(1), end: clock.sectionEnd(1), beatSec: clock.beatSec })
    lb.takeLoaded(take(1, 1))
    expect(lb.view).toMatchObject({ screen: "M", sideBySide: { counts: 8 } })
  })
})

describe("edge: takes deleted on the phone", () => {
  it("are gone from the glasses when Lookback is next opened", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(3))
    lb.leave()
    // Opened again: the server lists two now.
    lb.enter(2)
    expect(lb.setTakes(takes(2))).toMatchObject({ screen: "L", selected: 1 })
    expect(lb.view!.takes.map((t) => t.name)).toEqual(["s2-t1", "s2-t2"])
  })

  it("move the selection when the selected take is the one deleted", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(3))
    expect(lb.view!.selected).toBe(2)
    expect(lb.setTakes(takes(2))).toMatchObject({ selected: 1 })
    expect(lb.view).toMatchObject({ stepper: false, canBack: true, canForward: false })
  })

  it("leave I when every take is deleted", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(2))
    expect(lb.setTakes([])).toMatchObject({ screen: "I", selected: -1, stepper: false, canBack: false, canForward: false })
  })
})
