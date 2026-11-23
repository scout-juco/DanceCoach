import { describe, expect, it } from "vitest"
import { LOOKBACK_PILL, overlayFor } from "../DanceCoachLens/Assets/Scripts/Core/Overlay"
import { DEFAULT_SETTINGS, PlaybackController, ScreenId, Settings, ViewState } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { LookbackView } from "../DanceCoachLens/Assets/Scripts/Core/LookbackController"
import { PoseView } from "../DanceCoachLens/Assets/Scripts/Core/PoseController"
import { makeDance } from "./fixtures"

/** A view state on a screen, with a count and any setting overrides. */
function viewOn(screen: ScreenId, settings: Partial<Settings> = {}, extra: Partial<ViewState> = {}): ViewState {
  const base = new PlaybackController(makeDance()).view
  return { ...base, screen, count: 3, countIn: null, settings: { ...DEFAULT_SETTINGS, ...settings }, ...extra }
}

const pose = (step: number): PoseView => ({ screen: "D", section: 1, step, halfCounts: false, stepId: 0 })
const look = (record: LookbackView["record"], count = 0): LookbackView =>
  ({ screen: "K", section: 1, takes: [], selected: -1, stepper: false, canBack: false, canForward: false, phoneConnected: true, record, newTake: null, message: null, sideBySide: count ? { count } : null }) as unknown as LookbackView

describe("overlayFor: a clip playing (B, A1, F)", () => {
  for (const screen of ["B", "PV", "F"] as ScreenId[]) {
    it(`${screen}: lime outline, no pills, lock, ring, no handles, panel hidden`, () => {
      const o = overlayFor(viewOn(screen, { speed: 0.75, mirror: true }))
      expect(o).toEqual({ outline: "volt", pills: [], lock: true, ring: { color: "volt", count: 3, label: "3" }, handles: false, panel: "hidden" })
    })
  }
})

describe("overlayFor: counting in (B0)", () => {
  it("has a grey outline, the lock and no ring", () => {
    for (const screen of ["BI", "B0"] as ScreenId[]) {
      const o = overlayFor(viewOn(screen))
      expect(o).toMatchObject({ outline: "control", pills: [], lock: true, ring: null, handles: false, panel: "hidden" })
    }
  })
  it("hides the ring while a count-in is on, whatever the screen", () => {
    expect(overlayFor(viewOn("B", {}, { countIn: { count: 5 } as ViewState["countIn"] })).ring).toBeNull()
  })
})

describe("overlayFor: unlocked in Playthrough (C, C2)", () => {
  it("shows the speed (when not 1×) and MIRRORED, a volt ring, handles and the full panel", () => {
    const o = overlayFor(viewOn("C", { speed: 0.75, mirror: true }))
    expect(o.pills).toEqual([{ label: "0.75×", tone: "scrim" }, { label: "MIRRORED", tone: "scrim" }])
    expect(o).toMatchObject({ outline: "control", lock: false, ring: { color: "volt", count: 3 }, handles: true, panel: "full" })
    expect(overlayFor(viewOn("C2")).panel).toBe("full")
  })
  it("leaves out the speed at 1× and MIRRORED when mirror is off", () => {
    expect(overlayFor(viewOn("C")).pills).toEqual([])
    expect(overlayFor(viewOn("C", { speed: 0.5 })).pills).toEqual([{ label: "0.5×", tone: "scrim" }])
    expect(overlayFor(viewOn("C2", { mirror: true })).pills).toEqual([{ label: "MIRRORED", tone: "scrim" }])
  })
})

describe("overlayFor: Pose frozen (D, E)", () => {
  it("shows only MIRRORED (Pose has no speed), the ring from the step, handles; D scrub only, E full panel", () => {
    const d = overlayFor(viewOn("D", { speed: 0.5, mirror: true }), pose(4))
    expect(d.pills).toEqual([{ label: "MIRRORED", tone: "scrim" }])
    expect(d).toMatchObject({ outline: "control", lock: false, ring: { color: "volt", count: 3, label: "3" }, handles: true, panel: "scrub" })
    expect(overlayFor(viewOn("E", { speed: 0.5 }), pose(4)).pills).toEqual([])
    expect(overlayFor(viewOn("E"), pose(4)).panel).toBe("full")
  })
  it("labels a half-count step 3&, with the ring still at 3", () => {
    expect(overlayFor(viewOn("D"), pose(5)).ring).toEqual({ color: "volt", count: 3, label: "3&" })
  })
})

describe("overlayFor: Lookback (I, L)", () => {
  for (const screen of ["I", "L"] as ScreenId[]) {
    it(`${screen}: only the pink Lookback pill, a pink ring, handles, full panel`, () => {
      const o = overlayFor(viewOn(screen, { speed: 0.75, mirror: true }))
      expect(o.pills).toEqual([LOOKBACK_PILL])
      expect(LOOKBACK_PILL).toEqual({ label: "Lookback", tone: "pink" })
      expect(o).toMatchObject({ outline: "control", lock: false, ring: { color: "pink" }, handles: true, panel: "full" })
    })
  }
  it("J (the dialog) shows no pills, handles or panel", () => {
    expect(overlayFor(viewOn("J"))).toMatchObject({ pills: [], handles: false, panel: "hidden", lock: false })
  })
})

describe("overlayFor: Lookback recording (K)", () => {
  it("counting down: pink outline, lock, no ring, nothing else", () => {
    const o = overlayFor(viewOn("K"), null, look({ phase: "countdown", speed: 1, mirror: false, countdown: 2, progress: 0 }))
    expect(o).toEqual({ outline: "pink", pills: [], lock: true, ring: null, handles: false, panel: "hidden" })
  })
  it("recording: pink outline and a pink ring", () => {
    const o = overlayFor(viewOn("K"), null, look({ phase: "recording", speed: 1, mirror: false, countdown: 0, progress: 0.3 }))
    expect(o).toMatchObject({ outline: "pink", lock: true, ring: { color: "pink", count: 3 }, panel: "hidden" })
  })
})

describe("overlayFor: side by side (M)", () => {
  it("has no pills or handles; the original is volt, the take pink, each with a ring", () => {
    const l = look(null, 5)
    const original = overlayFor(viewOn("M"), null, l)
    const take = overlayFor(viewOn("M"), null, l, true)
    expect(original).toMatchObject({ outline: "volt", pills: [], lock: false, ring: { color: "volt", count: 5 }, handles: false, panel: "full" })
    expect(take).toMatchObject({ outline: "pink", pills: [], lock: false, ring: { color: "pink", count: 5 }, handles: false })
  })
})

describe("overlayFor: Counts off", () => {
  it("hides the ring on every screen, Pose too", () => {
    for (const screen of ["PV", "B", "F", "C", "C2", "I", "L", "G"] as ScreenId[]) {
      expect(overlayFor(viewOn(screen, { counts: false })).ring, screen).toBeNull()
    }
    expect(overlayFor(viewOn("D", { counts: false }), pose(2)).ring).toBeNull()
    expect(overlayFor(viewOn("K", { counts: false }), null, look({ phase: "recording", speed: 1, mirror: false, countdown: 0, progress: 0.1 })).ring).toBeNull()
  })
  it("keeps the pills", () => {
    expect(overlayFor(viewOn("C", { counts: false, mirror: true })).pills).toHaveLength(1)
  })
})
