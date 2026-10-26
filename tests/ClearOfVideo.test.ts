import { describe, expect, it } from "vitest"
import { clearYaw } from "../DanceCoachLens/Assets/Scripts/UI/ClearOfVideo"

const deg = (d: number) => (d * Math.PI) / 180
// A count-in 4° each side, reaching 3° up and 5° down; a video 10° wide and 16° tall at eye level.
const size = { half: deg(4), up: deg(3), down: deg(5) }
const video = (from: number, to: number, low = -8, high = 8) => ({ yawA: deg(from), yawB: deg(to), low: deg(low), high: deg(high) })
const gap = deg(1)

describe("Count-in clear of the video", () => {
  it("stays straight ahead when the video is off to the side", () => {
    expect(clearYaw(0, 0, size, video(10, 20), gap)).toBe(0)
    expect(clearYaw(0, 0, size, video(-20, -10), gap)).toBe(0)
  })

  it("stays straight ahead without a video", () => {
    expect(clearYaw(deg(30), 0, size, null, gap)).toBe(deg(30))
  })

  it("slides just clear of the video's nearer edge when it would cover it", () => {
    // Looking a little right of the video's centre: out past its right edge (10°), plus half and the gap.
    expect(clearYaw(deg(2), 0, size, video(-10, 10), gap)).toBeCloseTo(deg(15))
    // A little left of centre: out past its left edge.
    expect(clearYaw(deg(-2), 0, size, video(-10, 10), gap)).toBeCloseTo(deg(-15))
  })

  it("slides when only its edge would overlap the video", () => {
    expect(clearYaw(deg(8), 0, size, video(10, 20), gap)).toBeCloseTo(deg(5))
  })

  it("doesn't mind which way round the video's edges come", () => {
    expect(clearYaw(deg(2), 0, size, video(10, -10), gap)).toBeCloseTo(deg(15))
  })

  it("stays straight ahead when it's above or below the video", () => {
    expect(clearYaw(0, 0, size, video(-10, 10, 6, 20), gap)).toBe(0)
    expect(clearYaw(0, 0, size, video(-10, 10, -30, -6), gap)).toBe(0)
  })

  it("works across the ±180° seam", () => {
    // The video runs 170°…190°; 178° is nearer its 170° edge.
    expect(clearYaw(deg(178), 0, size, video(170, -170), gap)).toBeCloseTo(deg(165))
  })
})
