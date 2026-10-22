import { describe, expect, it } from "vitest"
import { CountClock } from "../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { makeDance } from "./fixtures"

describe("CountClock", () => {
  describe("section starts from tempo and first beat", () => {
    it("starts section n at firstBeatSec + (n − 1) · 8 counts", () => {
      const clock = new CountClock(makeDance())
      expect(clock.sectionStart(1)).toBe(1)
      expect(clock.sectionStart(2)).toBe(5)
      expect(clock.sectionStart(3)).toBe(9)
      expect(clock.sectionEnd(1)).toBe(5)
      expect(clock.sectionEnd(3)).toBe(13)
    })

    it("works at a tempo that doesn't divide evenly", () => {
      const clock = new CountClock(makeDance({ bpm: 100, firstBeatSec: 2.3, trim: { start: 0, end: 60 } }))
      expect(clock.sectionStart(2)).toBeCloseTo(2.3 + 4.8)
      expect(clock.sectionStart(5)).toBeCloseTo(2.3 + 4 * 4.8)
    })

    it("gives the lead-in as the last 4 counts of the previous section", () => {
      const clock = new CountClock(makeDance())
      expect(clock.leadIn(2)).toEqual({ start: 3, end: 5 })
      expect(clock.leadIn(3)).toEqual({ start: 7, end: 9 })
    })

    it("leads Section 1 in from the 4 counts before the trim, when the video has them", () => {
      expect(new CountClock(makeDance({ firstBeatSec: 2 })).leadIn(1)).toEqual({ start: 0, end: 2 })
      expect(new CountClock(makeDance({ firstBeatSec: 3, trim: { start: 3, end: 15 } })).leadIn(1)).toEqual({ start: 1, end: 3 })
      expect(new CountClock(makeDance()).leadIn(1)).toBeNull()
    })

    it("rejects sections that don't exist", () => {
      const clock = new CountClock(makeDance())
      expect(() => clock.sectionStart(0)).toThrow(RangeError)
      expect(() => clock.sectionStart(4)).toThrow(RangeError)
    })
  })

  describe("count and half-count at a time", () => {
    const clock = new CountClock(makeDance())

    it.each([
      [1, { section: 1, count: 1, and: false }],
      [1.25, { section: 1, count: 1, and: true }],
      [1.5, { section: 1, count: 2, and: false }],
      [2, { section: 1, count: 3, and: false }],
      [4.75, { section: 1, count: 8, and: true }],
      [5, { section: 2, count: 1, and: false }],
      [8.5, { section: 2, count: 8, and: false }],
      [12.9, { section: 3, count: 8, and: true }],
    ])("at %s s", (t, expected) => {
      expect(clock.at(t)).toEqual(expected)
    })

    it("is section 0 before the first beat", () => {
      expect(clock.at(0.5)).toEqual({ section: 0, count: 0, and: false })
    })

    it("lands on the beat despite float error", () => {
      const c = new CountClock(makeDance({ bpm: 100, firstBeatSec: 0.1, trim: { start: 0, end: 30 } }))
      const t = c.sectionStart(1) + 3 * c.beatSec
      expect(c.at(t)).toMatchObject({ count: 4, and: false })
    })

    it("counts a lead-in on the previous section's grid", () => {
      expect(clock.countIn(1, 3)).toEqual({ count: 5, and: false })
      expect(clock.countIn(1, 4.5)).toEqual({ count: 8, and: false })
    })
  })

  describe("manual nudges", () => {
    it("override the derived start and end of the nudged sections only", () => {
      const clock = new CountClock(makeDance({ sections: [{ start: 1 }, { start: 5.2, end: 9.3 }] }))
      expect(clock.sectionStart(1)).toBe(1)
      expect(clock.sectionStart(2)).toBe(5.2)
      expect(clock.sectionEnd(2)).toBe(9.3)
      expect(clock.sectionStart(3)).toBe(9)
    })

    it("count on the nudged section's own beat grid", () => {
      const clock = new CountClock(makeDance({ sections: [{ start: 1 }, { start: 5.2 }] }))
      expect(clock.at(5.1)).toMatchObject({ section: 1, count: 8 })
      expect(clock.at(5.2)).toEqual({ section: 2, count: 1, and: false })
      expect(clock.at(5.7)).toEqual({ section: 2, count: 2, and: false })
      expect(clock.leadIn(2)).toEqual({ start: 3.2, end: 5.2 })
    })

    it("give a section end of start + 8 counts when no end is nudged", () => {
      const clock = new CountClock(makeDance({ sections: [{ start: 1 }, { start: 5.2 }] }))
      expect(clock.sectionEnd(2)).toBeCloseTo(9.2)
    })
  })

  describe("number of sections", () => {
    it("counts whole sections exactly", () => {
      expect(new CountClock(makeDance()).sectionCount).toBe(3)
    })

    it("includes a partial last section", () => {
      const clock = new CountClock(makeDance({ trim: { start: 0, end: 14.5 } }))
      expect(clock.sectionCount).toBe(4)
      expect(clock.sectionEnd(4)).toBe(14.5)
    })

    it("works for a 6-section dance", () => {
      expect(new CountClock(makeDance({ trim: { start: 0, end: 25 } })).sectionCount).toBe(6)
    })

    it("is at least one section for a very short dance", () => {
      expect(new CountClock(makeDance({ trim: { start: 0, end: 2 } })).sectionCount).toBe(1)
    })

    it("includes extra nudged sections", () => {
      const clock = new CountClock(makeDance({ trim: { start: 0, end: 9 }, sections: [{ start: 1 }, { start: 5 }, { start: 8.9 }] }))
      expect(clock.sectionCount).toBe(3)
    })
  })

  describe("partial last section", () => {
    const clock = new CountClock(makeDance({ trim: { start: 0, end: 14.5 } }))

    it("ends where the footage ends, not on count 8", () => {
      expect(clock.sectionStart(4)).toBe(13)
      expect(clock.sectionEnd(4)).toBe(14.5)
      expect(clock.at(14)).toMatchObject({ section: 4, count: 3 })
    })

    it("keeps a nudged section's own end", () => {
      const nudged = new CountClock(makeDance({ trim: { start: 0, end: 14.5 }, sections: [{ start: 1 }, { start: 5 }, { start: 9 }, { start: 13, end: 17 }] }))
      expect(nudged.sectionEnd(4)).toBe(17)
    })

    it("leaves a full last section at 8 counts", () => {
      expect(new CountClock(makeDance()).sectionEnd(3)).toBe(13)
    })

    it("reports when the footage has run out", () => {
      expect(clock.isPastFootage(14.4)).toBe(false)
      expect(clock.isPastFootage(14.5)).toBe(true)
    })
  })
})
