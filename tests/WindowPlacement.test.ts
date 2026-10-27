import { describe, expect, it } from "vitest"
import { decodePlacement, encodePlacement, MAX_SCALE, MIN_SCALE, resizedScale } from "../DanceCoachLens/Assets/Scripts/Core/WindowPlacement"

const placed = { distanceCm: 180, yawRightDeg: -20, dropCm: 4, scale: 1.4 }

describe("A saved window placement should", () => {
  it("round-trip through the store", () => {
    expect(decodePlacement(encodePlacement(placed))).toEqual(placed)
  })

  it("be missing on first launch, so the default placement applies", () => {
    expect(decodePlacement(null)).toBeNull()
    expect(decodePlacement(undefined)).toBeNull()
    expect(decodePlacement("")).toBeNull()
  })

  it("fall back to the default when the data is bad", () => {
    expect(decodePlacement("not json")).toBeNull()
    expect(decodePlacement("[]")).toBeNull()
    expect(decodePlacement('{"distanceCm":180,"yawRightDeg":0,"dropCm":4}')).toBeNull()
    expect(decodePlacement('{"distanceCm":"far","yawRightDeg":0,"dropCm":4,"scale":1}')).toBeNull()
    expect(decodePlacement('{"distanceCm":5,"yawRightDeg":0,"dropCm":4,"scale":1}')).toBeNull()
    expect(decodePlacement('{"distanceCm":180,"yawRightDeg":0,"dropCm":4,"scale":0}')).toBeNull()
  })

  it("keep a saved scale within the resize limits", () => {
    expect(decodePlacement(encodePlacement({ ...placed, scale: 40 }))!.scale).toBe(MAX_SCALE)
    expect(decodePlacement(encodePlacement({ ...placed, scale: 0.01 }))!.scale).toBe(MIN_SCALE)
  })
})

describe("Pinching a corner should", () => {
  it("grow the window as the corner is pulled away from the centre", () => {
    expect(resizedScale(1, 30, 45)).toBeCloseTo(1.5)
  })

  it("shrink it as the corner is pushed in", () => {
    expect(resizedScale(1.2, 30, 20)).toBeCloseTo(0.8)
  })

  it("start from the window's current size", () => {
    expect(resizedScale(2, 30, 30)).toBe(2)
  })

  it("stop at the smallest and largest sizes", () => {
    expect(resizedScale(1, 30, 1)).toBe(MIN_SCALE)
    expect(resizedScale(1, 30, 3000)).toBe(MAX_SCALE)
  })

  it("leave the size alone when the pinch ray misses the window plane", () => {
    expect(resizedScale(1.3, 30, NaN)).toBe(1.3)
    expect(resizedScale(1.3, NaN, 40)).toBe(1.3)
    expect(resizedScale(1.3, 0, 40)).toBe(1.3)
  })
})
