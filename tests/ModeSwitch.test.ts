import { describe, expect, it } from "vitest"
import { MODE_PANEL, MODE_TRACK_WIDTH, modePanelSize, modeRow, SEGMENT_WIDTH, segmentFromRight } from "../DanceCoachLens/Assets/Scripts/UI/ModeRow"
import { Box, controlInWindow, cubicBezier, EASE, MODE_SWITCH, panelAt, progress, switchLength } from "../DanceCoachLens/Assets/Scripts/UI/ModeSwitch"

// The fixed-width mode track (BUILD_SPEC §6.8) and the mode switch motion (§6.8a, board B2ModeSwitch).

describe("Mode track", () => {
  it("is 420 wide with three equal 134.67 segments", () => {
    expect(MODE_TRACK_WIDTH).toBe(420)
    expect(SEGMENT_WIDTH).toBeCloseTo(134.67, 2)
    expect(3 * SEGMENT_WIDTH + 2 * MODE_PANEL.segmentGap + 2 * MODE_PANEL.trackPad).toBeCloseTo(420, 6)
  })

  it("sits in the top-right whatever the panel's width: segments measured from the right edge never change", () => {
    // Lookback, the narrowest panel, is exactly the track plus the padding.
    expect(modePanelSize(modeRow("L")).w).toBe(MODE_TRACK_WIDTH + 2 * MODE_PANEL.pad)
    // Lookback's segment (index 2) is the rightmost; Playthrough's starts 4 inside the track's left end.
    expect(segmentFromRight(2)).toBeCloseTo(MODE_PANEL.pad + MODE_PANEL.trackPad + SEGMENT_WIDTH / 2, 6)
    expect(segmentFromRight(0)).toBeCloseTo(MODE_PANEL.pad + MODE_TRACK_WIDTH - MODE_PANEL.trackPad - SEGMENT_WIDTH / 2, 6)
  })

  it("slides the pill one segment plus a gap per step (138.67)", () => {
    expect(segmentFromRight(0) - segmentFromRight(1)).toBeCloseTo(138.67, 2)
  })
})

describe("Easing", () => {
  it("is cubic-bezier(0.2, 0.8, 0.2, 1): pinned ends, a fast start", () => {
    expect(EASE(0)).toBe(0)
    expect(EASE(1)).toBe(1)
    expect(EASE(0.5)).toBeGreaterThan(0.85)
  })

  it("solves a linear curve to itself", () => {
    const linear = cubicBezier(0, 0, 1, 1)
    for (const x of [0.1, 0.3, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 4)
  })

  it("rises steadily", () => {
    let last = 0
    for (let x = 0.05; x <= 1; x += 0.05) {
      const y = EASE(x)
      expect(y).toBeGreaterThanOrEqual(last)
      last = y
    }
  })
})

describe("Switch timing", () => {
  it("runs the pill 0–150, the old row out 0–100, the resize 100–350, the new row 250–400, the takes panel 450–750", () => {
    expect(MODE_SWITCH.pill).toEqual({ start: 0, end: 150 })
    expect(MODE_SWITCH.out).toEqual({ start: 0, end: 100 })
    expect(MODE_SWITCH.resize).toEqual({ start: 100, end: 350 })
    expect(MODE_SWITCH.in).toEqual({ start: 250, end: 400 })
    expect(MODE_SWITCH.takesIn).toEqual({ start: 450, end: 750 })
  })

  it("is 0 before a window and 1 after it", () => {
    expect(progress(50, MODE_SWITCH.resize)).toBe(0)
    expect(progress(400, MODE_SWITCH.resize)).toBe(1)
  })

  it("brings new controls in 30 ms apart, rightmost first", () => {
    expect(controlInWindow(0)).toEqual({ start: 250, end: 400 })
    expect(controlInWindow(2)).toEqual({ start: 310, end: 460 })
  })

  it("locks the track until the last control is in, or the takes panel when entering Lookback", () => {
    expect(switchLength(3, false)).toBe(460)
    expect(switchLength(3, true)).toBe(750)
    expect(switchLength(0, false)).toBe(350)
  })
})

describe("Panel resize", () => {
  const playthrough: Box = [488, 648, 604, 144]
  const pose: Box = [596, 648, 496, 200]

  it("keeps the right edge put and grows left and down", () => {
    for (const ms of [0, 120, 200, 300, 350]) {
      const [x, , w] = panelAt(ms, playthrough, pose)
      expect(x + w).toBeCloseTo(1092, 6)
    }
  })

  it("holds the old size until 100 ms and lands on the new one at 350", () => {
    expect(panelAt(100, playthrough, pose)).toEqual(playthrough)
    expect(panelAt(350, playthrough, pose)).toEqual(pose)
    const [, , w, h] = panelAt(200, playthrough, pose)
    expect(w).toBeLessThan(604)
    expect(w).toBeGreaterThan(496)
    expect(h).toBeGreaterThan(144)
    expect(h).toBeLessThan(200)
  })
})
