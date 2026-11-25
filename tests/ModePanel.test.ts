import { describe, expect, it } from "vitest"
import { ScreenId } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { SCREENS } from "../DanceCoachLens/Assets/Scripts/UI/Layout"
import { CONTROL_WIDTH, modePanelSize, modeRow, nextSpeed, rowWidth, speedLabel } from "../DanceCoachLens/Assets/Scripts/UI/ModeRow"

// The mode panel (BUILD_SPEC §6.8): the track, then that mode's controls, sized from layout.json.

describe("Mode panel rows", () => {
  it("holds Replay section, From the top, Speed, Mirror and Counts on Clip ended (C)", () => {
    expect(modeRow("C")).toEqual(["replay", "top", "speed", "mirror", "counts"])
  })

  it("adds Finish routine last on C2, and only there", () => {
    expect(modeRow("C2")).toEqual([...modeRow("C"), "finish"])
    for (const id of Object.keys(SCREENS) as ScreenId[]) if (id !== "C2") expect(modeRow(id), id).not.toContain("finish")
  })

  it("holds Speed, Mirror and Counts in Lookback, and Record again and Back to takes on side by side", () => {
    expect(modeRow("I")).toEqual(["speed", "mirror", "counts"])
    expect(modeRow("L")).toEqual(["speed", "mirror", "counts"])
    expect(modeRow("M")).toEqual(["speed", "mirror", "counts", "recordAgain", "backToTakes"])
  })

  it("is the track alone with no row 2", () => {
    expect(modeRow("D")).toEqual([])
    expect(modePanelSize([])).toEqual({ w: 436, h: 72 })
    expect(SCREENS.D.controls).toBeUndefined()
  })

  it("holds ‹, Step size, ›, Mirror and Counts on Pose's open screen (E), with no speed", () => {
    expect(modeRow("E")).toEqual(["back", "step", "forward", "mirror", "counts"])
    expect(modeRow("E")).not.toContain("speed")
  })
})

describe("Mode panel size", () => {
  it("matches B2PlayEnd and B2LastDone: 604 and 772 wide, 144 tall", () => {
    expect(rowWidth(modeRow("C"))).toBe(580)
    expect(modePanelSize(modeRow("C"))).toEqual({ w: 604, h: 144 })
    expect(modePanelSize(modeRow("C2"))).toEqual({ w: 772, h: 144 })
  })

  it("matches B2PoseOpen: 496 wide, 200 tall, with the scrub row between the rows", () => {
    expect(modePanelSize(modeRow("E"))).toEqual({ w: 496, h: 200 })
  })

  it("is never narrower than the track plus padding (436)", () => {
    expect(modePanelSize(modeRow("L")).w).toBe(436)
  })

  it("fills each screen's controls box exactly, so it right-aligns to the video", () => {
    for (const id of Object.keys(SCREENS) as ScreenId[]) {
      const box = SCREENS[id].controls
      if (!box) continue
      const { w, h } = modePanelSize(modeRow(id))
      expect([box[2], box[3]], id).toEqual([w, h])
    }
  })

  it("keeps every control on the 4 px grid, and Mirror and Counts 56 circles", () => {
    for (const w of Object.values(CONTROL_WIDTH)) expect(w % 4).toBe(0)
    expect([CONTROL_WIDTH.mirror, CONTROL_WIDTH.counts]).toEqual([56, 56])
  })
})

describe("Speed button", () => {
  it("cycles 0.5× → 0.75× → 1× → 0.5×", () => {
    expect(nextSpeed(0.5)).toBe(0.75)
    expect(nextSpeed(0.75)).toBe(1)
    expect(nextSpeed(1)).toBe(0.5)
  })

  it("shows the speed it's on", () => {
    expect([0.5, 0.75, 1].map(speedLabel)).toEqual(["0.5×", "0.75×", "1×"])
  })
})
