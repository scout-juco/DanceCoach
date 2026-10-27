/**
 * ClearOfVideo: where the count-in goes so it doesn't cover the video.
 *
 * The count-in wants to sit straight ahead of you. If that would put it over the video, it
 * slides sideways just clear of the video's nearer edge instead. Everything is an angle seen
 * from your head: yaw about the vertical and elevation above eye level.
 *
 * Pure: angles in radians, no Lens Studio APIs, so Vitest can drive it.
 */
import { angleDiff } from "./PopupFollow"

/** An angular box seen from your head. Yaws can be either way round. */
export type AngleBox = { yawA: number; yawB: number; low: number; high: number }

/** The count-in's half-width, and how far it reaches above and below its centre, as angles. */
export type CountInSize = { half: number; up: number; down: number }

/**
 * The yaw to put the count-in at: `yaw` (straight ahead), or just clear of the video if the
 * count-in at `yaw` and `elev` would overlap it. `gap` is the space kept from the video's edge.
 */
export function clearYaw(yaw: number, elev: number, size: CountInSize, video: AngleBox | null, gap: number): number {
  if (!video) return yaw
  // Above or below the video: nothing to dodge.
  if (elev - size.down >= video.high || elev + size.up <= video.low) return yaw
  // The video's edges relative to yaw; the count-in must stay outside lo…hi.
  const a = angleDiff(video.yawA, yaw)
  const b = angleDiff(video.yawB, yaw)
  const lo = Math.min(a, b) - size.half - gap
  const hi = Math.max(a, b) + size.half + gap
  if (lo >= 0 || hi <= 0) return yaw
  // Slide out the nearer side.
  return yaw + (-lo < hi ? lo : hi)
}
