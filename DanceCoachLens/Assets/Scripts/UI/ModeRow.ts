/**
 * ModeRow: what the mode panel holds on each screen, and how big that makes it (BUILD_SPEC §6.8).
 *
 * Pure, so Vitest can check the panel's size against Layout's boxes. ModePanel draws it.
 * Row 1 is always the mode track; row 2 is that mode's controls, left to right.
 */
import { ScreenId, Speed } from "../Core/PlaybackController"
import { SIZE, SPACE } from "./Theme"

/** A control in the panel's row 2. */
export type ModeControl = "replay" | "top" | "speed" | "mirror" | "counts" | "finish" | "recordAgain" | "backToTakes"

/**
 * Each control's width, in prototype px, from layout.json (B2PlayEnd, B2LastDone, B2LookWatch) snapped to the 4 px grid:
 * text buttons are their label plus 20 a side, Mirror and Counts are 56 circles.
 */
export const CONTROL_WIDTH: Record<ModeControl, number> = {
  replay: 188,
  top: 144,
  speed: 88,
  mirror: SIZE.control,
  counts: SIZE.control,
  finish: 156,
  recordAgain: 152,
  backToTakes: 148,
}

/** The panel's insides: its padding and row gap, the track's inset, row 2's inset and the gap between its buttons. */
export const MODE_PANEL = {
  pad: SPACE.group,
  rowGap: SPACE.group,
  trackPad: SPACE.control,
  segmentGap: SPACE.control,
  rowPad: SPACE.control,
  gap: SPACE.between,
  minWidth: 400,
  /** The track: a 48 segment inside a 4 inset. */
  trackHeight: SIZE.segment + 2 * SPACE.control,
  /** Row 2: a 56 button inside a 4 inset. */
  rowHeight: SIZE.control + 2 * SPACE.control,
} as const

/**
 * Row 2 on each screen. C: Replay section · From the top · Speed · Mirror · Counts; C2 adds Finish routine.
 * Lookback (I, L): Speed · Mirror · Counts. Side by side (M) adds Record again and Back to takes.
 * Pose's collapsed screen (D) shows the track alone until Pose's panel is rebuilt (#48); E keeps its Pose bar.
 */
export function modeRow(screen: ScreenId): ModeControl[] {
  switch (screen) {
    case "C":
      return ["replay", "top", "speed", "mirror", "counts"]
    case "C2":
      return ["replay", "top", "speed", "mirror", "counts", "finish"]
    case "I":
    case "L":
      return ["speed", "mirror", "counts"]
    case "M":
      return ["speed", "mirror", "counts", "recordAgain", "backToTakes"]
    default:
      return []
  }
}

/** Row 2's width: its buttons and the 12 gaps between them. */
export function rowWidth(row: ModeControl[]): number {
  return row.reduce((w, c) => w + CONTROL_WIDTH[c], 0) + MODE_PANEL.gap * Math.max(0, row.length - 1)
}

/** The panel's size: wide enough for row 2 (at least 400), and one row taller when it has a row 2. */
export function modePanelSize(row: ModeControl[]): { w: number; h: number } {
  const p = MODE_PANEL
  const w = Math.max(p.minWidth, rowWidth(row) + 2 * p.rowPad + 2 * p.pad)
  const h = 2 * p.pad + p.trackHeight + (row.length ? p.rowGap + p.rowHeight : 0)
  return { w, h }
}

const SPEEDS: Speed[] = [0.5, 0.75, 1]

/** The Speed button's cycle: 0.5× → 0.75× → 1× → 0.5×. */
export function nextSpeed(speed: Speed): Speed {
  return SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
}

/** The Speed button's label: "0.5×", "0.75×", "1×". */
export const speedLabel = (speed: number) => `${speed}×`
