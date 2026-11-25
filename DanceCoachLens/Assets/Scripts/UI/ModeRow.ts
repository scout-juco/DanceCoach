/**
 * ModeRow: what the mode panel holds on each screen, and how big that makes it (BUILD_SPEC §6.8).
 *
 * Pure, so Vitest can check the panel's size against Layout's boxes. ModePanel draws it.
 * Row 1 is always the mode track; row 2 is that mode's controls, left to right.
 */
import { ScreenId, Speed } from "../Core/PlaybackController"
import { SIZE, SPACE } from "./Theme"

/** A control in the panel's row 2. */
export type ModeControl = "replay" | "top" | "speed" | "mirror" | "counts" | "finish" | "recordAgain" | "backToTakes" | "back" | "step" | "forward"

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
  // Pose (B2PoseOpen): ‹ and › are 56 circles; the step-size track is 4 + 94 + 4 + 94 + 4.
  back: SIZE.control,
  step: 200,
  forward: SIZE.control,
}

/** Pose's step-size options inside their track (BUILD_SPEC §6.10): two 48-tall options, 4 in and 4 apart. */
export const STEP_OPTION_WIDTH = 94

/** The scrub row between the track and row 2 on Pose's open screen (§6.11): a 28 playhead, then its 16-tall labels, 4 in from the top. */
export const POSE_SCRUB = {
  height: 48,
  /** Inset of the bar and labels from the panel's sides, inside the 8 padding. */
  inset: 16,
  barHeight: 12,
  handle: { w: 24, h: 28 },
  /** Top of the playhead's box, and the labels' centre, from the scrub row's top. */
  handleY: 4,
  labelY: 40,
} as const

/** The panel's insides: its padding and row gap, the track's inset, row 2's inset and the gap between its buttons. */
export const MODE_PANEL = {
  pad: SPACE.group,
  rowGap: SPACE.group,
  trackPad: SPACE.control,
  segmentGap: SPACE.control,
  rowPad: SPACE.control,
  gap: SPACE.between,
  minWidth: 436,
  /** The track: a 48 segment inside a 4 inset. */
  trackHeight: SIZE.segment + 2 * SPACE.control,
  /** Row 2: a 56 button inside a 4 inset. */
  rowHeight: SIZE.control + 2 * SPACE.control,
} as const

/**
 * The mode track (§6.8): a fixed 420 wide (wider than the board's 384, for more padding round "Playthrough"), pinned to the panel's top-right, whatever the panel's width.
 * Its three segments share what's inside its 4 inset and 4 gaps equally (flex 1 1 0): 134.67 each.
 */
export const MODE_TRACK_WIDTH = 420
export const SEGMENT_WIDTH = (MODE_TRACK_WIDTH - 2 * MODE_PANEL.trackPad - 2 * MODE_PANEL.segmentGap) / 3

/** Segment i's centre, measured left from the panel's right edge. */
export const segmentFromRight = (i: number) =>
  MODE_PANEL.pad + MODE_TRACK_WIDTH - MODE_PANEL.trackPad - i * (SEGMENT_WIDTH + MODE_PANEL.segmentGap) - SEGMENT_WIDTH / 2

/**
 * Row 2 on each screen. C: Replay section · From the top · Speed · Mirror · Counts; C2 adds Finish routine.
 * Lookback (I, L): Speed · Mirror · Counts. Side by side (M) adds Record again and Back to takes.
 * Pose's open screen (E): ‹ · Step size · › · Mirror · Counts, with the scrub row above it. Pose's collapsed screen (D) has no panel.
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
    case "E":
      return ["back", "step", "forward", "mirror", "counts"]
    default:
      return []
  }
}

/** Row 2's width: its buttons and the 12 gaps between them. */
export function rowWidth(row: ModeControl[]): number {
  return row.reduce((w, c) => w + CONTROL_WIDTH[c], 0) + MODE_PANEL.gap * Math.max(0, row.length - 1)
}

/** Pose's panel holds the scrub row, which is the only one with a step-size control. */
export const hasScrub = (row: ModeControl[]) => row.indexOf("step") >= 0

/** The panel's size: wide enough for row 2 (at least 400), one row taller when it has a row 2, and taller still with the scrub row. */
export function modePanelSize(row: ModeControl[]): { w: number; h: number } {
  const p = MODE_PANEL
  const w = Math.max(p.minWidth, rowWidth(row) + 2 * p.rowPad + 2 * p.pad)
  const scrub = hasScrub(row) ? p.rowGap + POSE_SCRUB.height : 0
  const h = 2 * p.pad + p.trackHeight + scrub + (row.length ? p.rowGap + p.rowHeight : 0)
  return { w, h }
}

const SPEEDS: Speed[] = [0.5, 0.75, 1]

/** The Speed button's cycle: 0.5× → 0.75× → 1× → 0.5×. */
export function nextSpeed(speed: Speed): Speed {
  return SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
}

/** The Speed button's label: "0.5×", "0.75×", "1×". */
export const speedLabel = (speed: number) => `${speed}×`
