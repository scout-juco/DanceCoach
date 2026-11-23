import { describe, expect, it } from "vitest"
import { LookbackController, STATUS_POLL_SEC, STEPPER_FROM, takeLabel } from "../DanceCoachLens/Assets/Scripts/Core/LookbackController"
import { Take } from "../DanceCoachLens/Assets/Scripts/Core/TakesClient"

const take = (number: number, speed = 1): Take => ({ name: `s2-t${number}`, section: 2, speed, mirror: false, number })
const takes = (n: number) => Array.from({ length: n }, (_, i) => take(i + 1))

describe("Lookback: entering", () => {
  it("opens on screen I with no takes", () => {
    const v = new LookbackController().enter(2, [])
    expect(v).toMatchObject({ screen: "I", section: 2, takes: [], selected: -1, stepper: false, phoneConnected: false })
  })

  it("opens on screen L with the newest take selected", () => {
    const v = new LookbackController().enter(2, takes(3))
    expect(v).toMatchObject({ screen: "L", section: 2, selected: 2 })
    expect(v.takes).toHaveLength(3)
  })

  it("moves from I to L when the listing arrives after entering", () => {
    const lb = new LookbackController()
    expect(lb.enter(2).screen).toBe("I")
    expect(lb.setTakes(takes(2))).toMatchObject({ screen: "L", selected: 1 })
  })

  it("keeps the selected take when the listing is refreshed", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(3))
    lb.selectTake(0)
    expect(lb.setTakes(takes(4))).toMatchObject({ selected: 0 })
  })

  it("has no view outside Lookback", () => {
    const lb = new LookbackController()
    expect(lb.view).toBeNull()
    lb.enter(2, takes(1))
    lb.leave()
    expect(lb.view).toBeNull()
    expect(lb.setTakes(takes(2))).toBeNull()
    expect(lb.selectTake(0)).toBeNull()
  })
})

describe("Lookback: the takes row", () => {
  it("is a button per take up to three: no stepper, nothing out of range", () => {
    for (const n of [1, 2, 3]) expect(new LookbackController().enter(2, takes(n))).toMatchObject({ stepper: false, selected: n - 1 })
  })

  it("becomes the stepper from four takes", () => {
    expect(STEPPER_FROM).toBe(4)
    expect(new LookbackController().enter(2, takes(3)).stepper).toBe(false)
    expect(new LookbackController().enter(2, takes(4)).stepper).toBe(true)
    expect(new LookbackController().enter(2, takes(6)).stepper).toBe(true)
  })

  it("selects a take by number on the buttons, and ignores one that isn't there", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(3))
    expect(lb.selectTake(0)).toMatchObject({ selected: 0 })
    expect(lb.selectTake(3)).toMatchObject({ selected: 0 })
    expect(lb.selectTake(-1)).toMatchObject({ selected: 0 })
  })

  it("steps ‹ and › over every take, not just the last four", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(6))
    expect(lb.view).toMatchObject({ selected: 5, canBack: true, canForward: false })
    for (let i = 4; i >= 0; i--) expect(lb.stepTake(-1)!.selected).toBe(i)
    expect(lb.view).toMatchObject({ selected: 0, canBack: false, canForward: true })
    expect(lb.stepTake(1)!.selected).toBe(1)
  })

  it("stops ‹ at the first take and › at the newest", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(5))
    expect(lb.stepTake(1)).toMatchObject({ selected: 4, canForward: false })
    lb.selectTake(0)
    expect(lb.stepTake(-1)).toMatchObject({ selected: 0, canBack: false })
  })

  it("ignores ‹ › with no takes and mid-recording", () => {
    const lb = new LookbackController()
    lb.enter(2, [])
    expect(lb.stepTake(-1)).toMatchObject({ selected: -1, canBack: false, canForward: false })
    lb.enter(2, takes(4))
    lb.tapRecord(1, false, { start: 0, end: 4 })
    expect(lb.stepTake(-1)).toMatchObject({ selected: 3 })
  })

  it("keeps an earlier take selected when more takes arrive, and updates the stepper", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(3))
    lb.selectTake(0)
    const v = lb.setTakes(takes(5))!
    expect(v).toMatchObject({ selected: 0, stepper: true, canBack: false, canForward: true })
  })
})

describe("Lookback: labels", () => {
  it("names a take by number and speed", () => {
    expect(takeLabel(take(3, 0.75))).toBe("TAKE 3 · 0.75×")
    expect(takeLabel(take(1))).toBe("TAKE 1 · 1×")
  })
})

describe("Lookback: status polling", () => {
  it("is due every STATUS_POLL_SEC while in Lookback", () => {
    const lb = new LookbackController()
    lb.enter(2, [])
    let polls = 0
    for (let i = 0; i < 50; i++) if (lb.tick(0.1)) polls++
    expect(polls).toBe(Math.floor(5 / STATUS_POLL_SEC))
  })

  it("is never due outside Lookback", () => {
    const lb = new LookbackController()
    expect(lb.tick(10)).toBe(false)
    lb.enter(2, [])
    lb.leave()
    expect(lb.tick(10)).toBe(false)
  })

  it("starts its wait again on re-entering", () => {
    const lb = new LookbackController()
    lb.enter(2, [])
    lb.tick(STATUS_POLL_SEC - 0.1)
    lb.leave()
    lb.enter(2, [])
    expect(lb.tick(0.2)).toBe(false)
  })

  it("shows whether the phone is connected", () => {
    const lb = new LookbackController()
    lb.enter(2, takes(1))
    expect(lb.phoneStatus(true)).toMatchObject({ phoneConnected: true })
    expect(lb.phoneStatus(false)).toMatchObject({ phoneConnected: false })
  })

  it("keeps the phone's status when the takes are refreshed", () => {
    const lb = new LookbackController()
    lb.enter(2, [])
    lb.phoneStatus(true)
    expect(lb.setTakes(takes(1))).toMatchObject({ phoneConnected: true })
  })
})
