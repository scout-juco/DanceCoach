import { describe, expect, it } from "vitest"
import { routineDoneEyebrow, speedMirrorLabel } from "../DanceCoachLens/Assets/Scripts/Core/DialogCopy"

const settings = { speed: 1 as const, mirror: false, counts: true, halfCounts: false }

describe("Dialog copy", () => {
  it("Routine done's eyebrow names From the top with its range and the speed", () => {
    expect(routineDoneEyebrow({ runKind: "top", section: 4, runStop: 4, sectionCount: 4, settings })).toBe("FROM THE TOP · SECTION 1 → SECTION 4 · 1×")
  })

  it("names a Full run and a single section", () => {
    expect(routineDoneEyebrow({ runKind: "full", section: 3, runStop: 3, sectionCount: 3, settings })).toBe("FULL ROUTINE · SECTION 1 → SECTION 3 · 1×")
    expect(routineDoneEyebrow({ runKind: "section", section: 3, runStop: 3, sectionCount: 3, settings: { ...settings, speed: 0.75 } })).toBe("SECTION 3 · 0.75×")
  })

  it("writes Speed · mirror", () => {
    expect(speedMirrorLabel(0.75, true)).toBe("0.75× · ON")
    expect(speedMirrorLabel(1, false)).toBe("1× · OFF")
  })
})
