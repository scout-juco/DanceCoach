/**
 * WindowPlacement: where the window sits, relative to where you stand and face when the Lens
 * starts, and how big it is. Saved as a string in Lens persistent storage.
 *
 * Pure: the Lens turns a placement into a pose and back; this only encodes and validates it,
 * and does the resize maths, so a missing or damaged entry falls back to the default placement.
 */

/** The window's distance ahead, turn to the right and drop below eye level, and its scale (1 = as laid out). */
export type Placement = {
  distanceCm: number
  yawRightDeg: number
  dropCm: number
  scale: number
}

/** The persistent storage key the window placement lives under. */
export const PLACEMENT_KEY = "danceCoach.windowPlacement"

/** How far a corner pinch can shrink or grow the window. */
export const MIN_SCALE = 0.5
export const MAX_SCALE = 2.5

// Closer than this and the window is out of reach of a far pinch and fills the view.
const MIN_DISTANCE_CM = 30

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/**
 * The scale while a corner is pinched: the window grows with the corner's distance from its centre.
 * `startDistCm` and `nowDistCm` are that distance when the pinch began and now.
 */
export function resizedScale(startScale: number, startDistCm: number, nowDistCm: number): number {
  if (!(startDistCm > 0) || !isFinite(nowDistCm)) return startScale
  return clampScale((startScale * nowDistCm) / startDistCm)
}

export function encodePlacement(p: Placement): string {
  return JSON.stringify({ distanceCm: p.distanceCm, yawRightDeg: p.yawRightDeg, dropCm: p.dropCm, scale: p.scale })
}

/** Reads a saved placement; null when there's none (first launch) or it's damaged, so the default applies. */
export function decodePlacement(raw: string | null | undefined): Placement | null {
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
  if (!data || typeof data !== "object") return null
  const num = (v: any) => typeof v === "number" && isFinite(v)
  if (!num(data.distanceCm) || !num(data.yawRightDeg) || !num(data.dropCm) || !num(data.scale)) return null
  if (data.distanceCm < MIN_DISTANCE_CM || data.scale <= 0) return null
  return { distanceCm: data.distanceCm, yawRightDeg: data.yawRightDeg, dropCm: data.dropCm, scale: clampScale(data.scale) }
}
