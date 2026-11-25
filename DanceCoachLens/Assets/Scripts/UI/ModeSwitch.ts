/**
 * ModeSwitch: the mode panel's switch motion (BUILD_SPEC §6.8a, board B2ModeSwitch), as pure timing.
 *
 * Pure, so Vitest can check it. ModePanel and LookPanel ask it where each part is, in ms since the tap.
 * Every tween uses EASE, cubic-bezier(0.2, 0.8, 0.2, 1):
 *   0–150    the selection pill slides to the tapped segment (and crossfades volt ↔ pink)
 *   0–100    the old row 2 controls (and Pose's scrub row) fade out; leaving Lookback, the takes panel too
 *   100–350  the panel's width and height tween to the new mode's size, nothing drawn under the track
 *   250–400  the new controls fade in from 8 px below, 30 ms apart, right to left
 *   450–750  entering Lookback, the takes panel fades in from 24 px to the right
 */

/** One tween's window, in ms since the tap. */
export interface Window {
  start: number
  end: number
}

export const MODE_SWITCH = {
  pill: { start: 0, end: 150 },
  out: { start: 0, end: 100 },
  resize: { start: 100, end: 350 },
  in: { start: 250, end: 400 },
  /** Each new control starts this much after the one to its right. */
  stagger: 30,
  /** The new controls rise this far, in prototype px. */
  rise: 8,
  takesIn: { start: 450, end: 750 },
  /** The takes panel slides in from this far right, in prototype px. */
  takesShift: 24,
} as const

/** Solves a CSS cubic-bezier(x1, y1, x2, y2) for y at x (0 to 1). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t
  const slope = (t: number, a: number, b: number) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    // Newton's method, falling back to bisection where the slope is flat.
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = bez(t, x1, x2) - x
      const d = slope(t, x1, x2)
      if (Math.abs(err) < 1e-6) return bez(t, y1, y2)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    let lo = 0
    let hi = 1
    t = x
    for (let i = 0; i < 30; i++) {
      const v = bez(t, x1, x2)
      if (Math.abs(v - x) < 1e-6) break
      if (v < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return bez(t, y1, y2)
  }
}

/** The one easing for the whole switch. */
export const EASE = cubicBezier(0.2, 0.8, 0.2, 1)

/** How far through a window the switch is at ms, eased: 0 before it starts, 1 once it's over. */
export function progress(ms: number, w: Window): number {
  return EASE(Math.min(1, Math.max(0, (ms - w.start) / (w.end - w.start))))
}

/**
 * The window in which new control i fades in. Index 0 is the rightmost, so the row comes in right to left.
 * Each control takes the in window's length; the next starts `stagger` later.
 */
export function controlInWindow(indexFromRight: number): Window {
  const { start, end } = MODE_SWITCH.in
  const delay = indexFromRight * MODE_SWITCH.stagger
  return { start: start + delay, end: end + delay }
}

/** How long a switch runs (and the mode track ignores taps): the last control in, and the takes panel when entering Lookback. */
export function switchLength(controls: number, intoLookback: boolean): number {
  const last = controls > 0 ? controlInWindow(controls - 1).end : 0
  return Math.max(last, MODE_SWITCH.resize.end, intoLookback ? MODE_SWITCH.takesIn.end : 0)
}

/** A rectangle in prototype px: [left, top, width, height]. */
export type Box = [number, number, number, number]

/**
 * The panel's rectangle at ms: its top-right corner and size tween from `from` to `to` over the resize window,
 * so it grows or shrinks to the left and downward. (The corner itself only moves when the element above the
 * panel differs between the two screens, as Clip ended's section tiles do.)
 */
export function panelAt(ms: number, from: Box, to: Box): Box {
  const k = progress(ms, MODE_SWITCH.resize)
  const lerp = (a: number, b: number) => a + (b - a) * k
  const right = lerp(from[0] + from[2], to[0] + to[2])
  const w = lerp(from[2], to[2])
  return [right - w, lerp(from[1], to[1]), w, lerp(from[3], to[3])]
}
