import { describe, expect, it } from "vitest"
import {
  COUNTDOWN_FROM,
  LookbackController,
  MESSAGE_SEC,
  PHONE_DROPPED_MESSAGE,
  SAVE_FAILED_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_TIMEOUT_SEC,
  takeLabel,
} from "../DanceCoachLens/Assets/Scripts/Core/LookbackController"
import { RecorderStatus, Take } from "../DanceCoachLens/Assets/Scripts/Core/TakesClient"

const take = (number: number, speed = 1): Take => ({ name: `s2-t${number}`, section: 2, speed, mirror: false, number })
const takes = (n: number) => Array.from({ length: n }, (_, i) => take(i + 1))

// The section plays from 10 s to 18 s of the original.
const RANGE = { start: 10, end: 18 }

/** Lookback on section 2 with the phone connected, asked "Record lookback?" at 0.75× mirrored. */
function onJ(existing = 0) {
  const lb = new LookbackController()
  lb.enter(2, takes(existing))
  lb.phoneStatus(true)
  lb.tapRecord(0.75, true, RANGE)
  return lb
}

/** Through Yes, record and the server arming the take: counting down. */
function counting(existing = 0) {
  const lb = onJ(existing)
  lb.confirm()
  lb.armed("s9")
  lb.takeRequests()
  return lb
}

/** Through the countdown: the section is playing. */
function recording(existing = 0) {
  const lb = counting(existing)
  lb.tick(COUNTDOWN_FROM)
  lb.takeRequests()
  return lb
}

/** Through the end of the section: saving the take. */
function saving(existing = 0) {
  const lb = recording(existing)
  lb.tick(0.1, RANGE.end)
  lb.takeRequests()
  return lb
}

const ready = (n: number, id = "s9"): RecorderStatus => ({ phoneConnected: true, session: { id, state: "ready", take: take(n, 0.75) } })

describe("Record lookback? (screen J)", () => {
  it("shows the section, speed and mirror it will use", () => {
    expect(onJ().view).toMatchObject({ screen: "J", section: 2, record: { phase: "confirm", speed: 0.75, mirror: true } })
  })

  it("opens over L when the section has takes", () => {
    const v = onJ(2).view!
    expect(v.screen).toBe("J")
    expect(v.takes).toHaveLength(2)
  })

  it("blocks Yes, record until the phone is connected", () => {
    const lb = new LookbackController()
    lb.enter(2, [])
    lb.tapRecord(1, false, RANGE)
    expect(lb.confirm()).toMatchObject({ screen: "J", phoneConnected: false })
    expect(lb.takeRequests()).toEqual([])
    lb.phoneStatus(true)
    expect(lb.confirm()).toMatchObject({ screen: "K" })
  })

  it("goes back to I on Not now, and to L when there are takes", () => {
    expect(onJ().cancel()).toMatchObject({ screen: "I", record: null })
    expect(onJ(2).cancel()).toMatchObject({ screen: "L", record: null, selected: 1 })
  })

  it("asks nothing of the server for Not now", () => {
    const lb = onJ()
    lb.cancel()
    expect(lb.takeRequests()).toEqual([])
  })

  it("follows the phone's connection while open", () => {
    expect(onJ().phoneStatus(false)).toMatchObject({ screen: "J", phoneConnected: false })
  })
})

describe("Recording: arming and the countdown (screen K)", () => {
  it("arms the take with the section, speed and mirror on Yes, record", () => {
    const lb = onJ()
    expect(lb.confirm()).toMatchObject({ screen: "K", record: { phase: "arming", countdown: 3 } })
    expect(lb.takeRequests()).toEqual([{ type: "arm", params: { section: 2, speed: 0.75, mirror: true } }])
    expect(lb.takeRequests()).toEqual([])
  })

  it("holds on 3 until the server has armed the take", () => {
    const lb = onJ()
    lb.confirm()
    lb.takeRequests()
    lb.tick(5)
    expect(lb.view!.record).toMatchObject({ phase: "arming", countdown: 3 })
    expect(lb.takeRequests()).toEqual([])
  })

  it("counts 3, 2, 1, one per second", () => {
    const lb = counting()
    expect(lb.view!.record).toMatchObject({ phase: "countdown", countdown: 3 })
    lb.tick(0.9)
    expect(lb.view!.record!.countdown).toBe(3)
    lb.tick(0.2)
    expect(lb.view!.record!.countdown).toBe(2)
    lb.tick(1)
    expect(lb.view!.record!.countdown).toBe(1)
    expect(lb.takeRequests()).toEqual([])
  })

  it("tells the server the run started when the count runs out, and plays the section", () => {
    const lb = counting()
    lb.tick(1)
    lb.tick(1)
    expect(lb.takeRequests()).toEqual([])
    lb.tick(1)
    expect(lb.takeRequests()).toEqual([{ type: "start", sessionId: "s9" }])
    expect(lb.view!.record).toMatchObject({ phase: "recording", countdown: 0, progress: 0 })
  })

  it("sends start once", () => {
    const lb = recording()
    lb.tick(1, 11)
    lb.tick(1, 12)
    expect(lb.takeRequests()).toEqual([])
  })

  it("ignores Yes again, and an arming for a take that isn't being armed", () => {
    const lb = counting()
    lb.confirm()
    expect(lb.takeRequests()).toEqual([])
    lb.armed("other")
    expect(lb.view!.record).toMatchObject({ phase: "countdown" })
    expect(lb.takeRequests()).toEqual([])
  })

  it("cannot be cancelled once armed", () => {
    expect(counting().cancel()).toMatchObject({ screen: "K" })
  })
})

describe("Recording: the section plays", () => {
  it("shows the progress through the section", () => {
    const lb = recording()
    lb.tick(0.1, 10)
    expect(lb.view!.record!.progress).toBe(0)
    lb.tick(0.1, 12)
    expect(lb.view!.record!.progress).toBeCloseTo(0.25)
    lb.tick(0.1, 17)
    expect(lb.view!.record!.progress).toBeCloseTo(0.875)
  })

  it("stops the take and shows Saving take… when the section ends", () => {
    const lb = recording()
    lb.tick(0.1, 17.9)
    expect(lb.takeRequests()).toEqual([])
    lb.tick(0.1, 18)
    expect(lb.view).toMatchObject({ screen: "K", record: { phase: "saving", progress: 1 } })
    expect(lb.takeRequests()).toEqual([{ type: "stop", sessionId: "s9" }])
  })

  it("sends stop once", () => {
    const lb = saving()
    lb.tick(0.1, 18)
    expect(lb.takeRequests()).toEqual([])
  })

  it("stays on K, locked, while recording: no selecting takes or starting another", () => {
    const lb = recording(3)
    lb.selectTake(0)
    lb.tapRecord(1, false, RANGE)
    expect(lb.view).toMatchObject({ screen: "K", selected: 2, record: { phase: "recording", speed: 0.75 } })
  })
})

describe("Recording: saving the take", () => {
  it("asks for the take to be downloaded once the server has it", () => {
    const lb = saving()
    lb.recorderStatus({ phoneConnected: true, session: { id: "s9", state: "processing" } })
    expect(lb.takeRequests()).toEqual([])
    lb.recorderStatus(ready(1))
    expect(lb.takeRequests()).toEqual([{ type: "download", take: take(1, 0.75) }])
    lb.recorderStatus(ready(1))
    expect(lb.takeRequests()).toEqual([])
    expect(lb.view).toMatchObject({ screen: "K", record: { phase: "saving" } })
  })

  it("shows the new take on L, selected and tagged NEW", () => {
    const lb = saving(2)
    lb.recorderStatus(ready(3))
    lb.takeRequests()
    const v = lb.downloaded(take(3, 0.75))!
    expect(v).toMatchObject({ screen: "L", record: null, selected: 2, newTake: "s2-t3", message: null })
    expect(v.takes.map((t) => t.number)).toEqual([1, 2, 3])
    expect(v.attempts.map((t) => t.number)).toEqual([1, 2, 3])
    expect(takeLabel(v.takes[2], v.newTake === v.takes[2].name)).toBe("TAKE 3 · 0.75× · NEW")
    expect(takeLabel(v.takes[1], v.newTake === v.takes[1].name)).toBe("TAKE 2 · 1×")
  })

  it("moves from I to L with the first take", () => {
    const lb = saving()
    lb.downloaded(take(1, 0.75))
    expect(lb.view).toMatchObject({ screen: "L", selected: 0, newTake: "s2-t1" })
  })

  it("keeps the take if the listing arrives afterwards", () => {
    const lb = saving()
    lb.downloaded(take(1, 0.75))
    expect(lb.setTakes([take(1, 0.75)])).toMatchObject({ screen: "L", selected: 0, newTake: "s2-t1" })
  })

  it("clears NEW when another recording starts, or Lookback is left", () => {
    const lb = saving()
    lb.downloaded(take(1, 0.75))
    expect(lb.tapRecord(1, false, RANGE)!.newTake).toBeNull()
    lb.leave()
    expect(lb.enter(2, takes(1)).newTake).toBeNull()
  })

  it("ignores a status for another session", () => {
    const lb = saving()
    lb.recorderStatus(ready(1, "old"))
    expect(lb.takeRequests()).toEqual([])
  })
})

describe("Recording: failures go back to I or L with a message", () => {
  it("fails when the server won't arm the take", () => {
    const lb = onJ()
    lb.confirm()
    expect(lb.armFailed("HTTP 500")).toMatchObject({ screen: "I", record: null, message: "HTTP 500" })
    expect(lb.takeRequests()).toEqual([])
  })

  it("goes back to L if there are takes", () => {
    const lb = onJ(2)
    lb.confirm()
    expect(lb.armFailed("HTTP 500")).toMatchObject({ screen: "L", selected: 1, message: "HTTP 500" })
  })

  it("fails when the phone disconnects before the section plays", () => {
    expect(counting().recorderStatus({ phoneConnected: false, session: { id: "s9", state: "armed" } })).toMatchObject({ screen: "I", message: PHONE_DROPPED_MESSAGE })
    const arming = onJ()
    arming.confirm()
    expect(arming.recorderStatus({ phoneConnected: false, session: null })).toMatchObject({ screen: "I", message: PHONE_DROPPED_MESSAGE })
  })

  it("keeps the take over a dropped phone once the section is playing", () => {
    const lb = recording()
    expect(lb.recorderStatus({ phoneConnected: false, session: { id: "s9", state: "recording" } })).toMatchObject({ screen: "K", phoneConnected: false })
  })

  it("fails with the server's reason when the take couldn't be saved", () => {
    const lb = saving(1)
    expect(lb.recorderStatus({ phoneConnected: true, session: { id: "s9", state: "failed", reason: "The recording was empty" } })).toMatchObject({
      screen: "L",
      record: null,
      message: "The recording was empty",
    })
  })

  it("fails with a stock message when the server gives no reason", () => {
    const lb = saving()
    expect(lb.recorderStatus({ phoneConnected: true, session: { id: "s9", state: "failed" } })!.message).toBe(SAVE_FAILED_MESSAGE)
  })

  it("fails when the download fails", () => {
    const lb = saving()
    lb.recorderStatus(ready(1))
    expect(lb.downloadFailed("Couldn't load")).toMatchObject({ screen: "I", message: "Couldn't load" })
  })

  it("fails when a start or stop request doesn't get through", () => {
    expect(recording().requestFailed("HTTP 500")).toMatchObject({ screen: "I", message: "HTTP 500" })
  })

  it("gives up on a take that never finishes saving", () => {
    const lb = saving()
    lb.tick(SAVE_TIMEOUT_SEC - 1)
    expect(lb.view!.screen).toBe("K")
    lb.tick(1)
    expect(lb.view).toMatchObject({ screen: "I", message: SAVE_TIMEOUT_MESSAGE })
  })

  it("clears the message after a few seconds", () => {
    const lb = onJ()
    lb.confirm()
    lb.armFailed("HTTP 500")
    lb.tick(MESSAGE_SEC - 1)
    expect(lb.view!.message).toBe("HTTP 500")
    lb.tick(1)
    expect(lb.view!.message).toBeNull()
  })

  it("can record again after a failure", () => {
    const lb = onJ()
    lb.confirm()
    lb.armFailed("HTTP 500")
    expect(lb.tapRecord(1, false, RANGE)).toMatchObject({ screen: "J", message: null })
  })

  it("forgets a recording when Lookback is left", () => {
    const lb = recording()
    lb.leave()
    expect(lb.takeRequests()).toEqual([])
    expect(lb.view).toBeNull()
    expect(lb.armed("s9")).toBeNull()
    lb.enter(2, [])
    expect(lb.view!.record).toBeNull()
  })
})
