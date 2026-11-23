/**
 * Layout: panel rectangles keyed by the prototype's screen IDs, in prototype pixels
 * (the 1280×800 "Spectacles view" frames), measured from the B2 handoff (design/b2-handoff/layout.json).
 *
 * Pixels become world units around ANCHOR: 1 px = 1.5 mm, and the anchor sits at the
 * placement point (PLACEMENT: 3.24 m away, 7° to the right and 0.10 m below eye level).
 * Lens Studio world units are centimetres.
 */
import { RunKind, ScreenId } from "../Core/PlaybackController"
import { Placement } from "../Core/WindowPlacement"

/** [x, y, width, height] in prototype pixels. */
export type PxRect = [number, number, number, number]

export type PanelId = "video" | "progress" | "segBar" | "sections" | "controls" | "poseLine" | "poseBar" | "lookPanel" | "attempts" | "countdown" | "toast" | "skip" | "popup" | "take" | "sbsBar"

/** The video window's three sizes (BUILD_SPEC §6.1), all at x 792, y 40. */
const VIDEO_FULL: PxRect = [792, 40, 340, 604]
const VIDEO_BESIDE: PxRect = [792, 40, 300, 520]
const VIDEO_TILES: PxRect = [792, 40, 300, 504]

/** The bars 16 below a full-height video: a progress bar is 8 tall; a section bar is 8 plus its labels (8 + 4 + 16). */
const PROGRESS: PxRect = [792, 660, 340, 8]
const SEG_BAR: PxRect = [792, 660, 340, 28]

/**
 * The legacy panels have no B2 surface: "attempts" goes with Lookback's rebuild (#49).
 * Until then it sits 24 clear of its neighbours, out of the way.
 */
export const LEGACY_PANELS: PanelId[] = ["attempts"]

/** Floating panels: they aren't surfaces on the board (a toast, a pop-up that opens in front of you). */
export const FLOATING_PANELS: PanelId[] = ["toast", "popup"]

/**
 * Every rect is measured from design/b2-handoff/layout.json and snapped to the 4 px grid. Surfaces are 24 apart;
 * the mode panel and section tiles are right-aligned to the video's right edge. `controls` is the mode panel's box,
 * sized to what it holds on that screen (ModeRow.modePanelSize).
 */
export const SCREENS: Record<ScreenId, Partial<Record<PanelId, PxRect>>> = {
  // A1, First look: the section bar 16 under the video, "Skip to Section 1 ›" 24 under that, right-aligned.
  PV: { video: VIDEO_FULL, segBar: SEG_BAR, skip: [948, 712, 184, 56] },
  // B0: the starting pose (BI) or a lead-in (B0), the progress bar with its start marker and caption 8 under it.
  // The count-in opens in front of you (COUNT_IN), not on the board.
  BI: { video: VIDEO_FULL, progress: PROGRESS },
  B0: { video: VIDEO_FULL, progress: PROGRESS },
  B: { video: VIDEO_FULL, progress: PROGRESS },
  // From the top: the section bar with its stop point, and no banner.
  F: { video: VIDEO_FULL, segBar: SEG_BAR },
  // Clip ended: tiles 24 under the video, the mode panel 24 under them. The toast sits left, 24 above the tiles.
  C: { video: VIDEO_TILES, sections: [604, 568, 488, 56], controls: [488, 648, 604, 144], toast: [360, 496, 420, 48] },
  // Last section done: the panel widens for Finish routine.
  C2: { video: VIDEO_TILES, sections: [604, 568, 488, 56], controls: [320, 648, 772, 144], toast: [360, 496, 420, 48] },
  // Routine done: a dialog centred in the frame. It opens in front of you (POPUP), so on device only its size counts.
  G: { video: VIDEO_FULL, popup: [320, 220, 640, 360] },
  // Pose, collapsed: the thin scrub 24 under the video. B2 has no panel here; until #48 the mode track alone
  // sits 24 under the scrub, right-aligned, so the mode can still change.
  D: { video: VIDEO_FULL, poseLine: [792, 668, 340, 8], controls: [732, 700, 400, 72] },
  // Pose, open: the mode panel with the scrub and step controls, 24 under the video.
  E: { video: VIDEO_BESIDE, poseBar: [592, 584, 500, 200] },
  // Lookback: the side panel 24 left of the video, the mode panel 24 under the video. The old ATTEMPTS row
  // sits left of the mode panel, and the toast left of the side panel.
  I: { video: VIDEO_BESIDE, lookPanel: [468, 40, 300, 520], attempts: [48, 584, 620, 56], controls: [692, 584, 400, 144], toast: [24, 512, 420, 48] },
  L: { video: VIDEO_BESIDE, lookPanel: [468, 40, 300, 520], attempts: [48, 584, 620, 56], controls: [692, 584, 400, 144], toast: [24, 512, 420, 48] },
  // Record lookback?: a dialog centred over I or L, with no mode panel (the board is locked behind it).
  J: { video: VIDEO_BESIDE, lookPanel: [468, 40, 300, 520], attempts: [48, 584, 620, 56], popup: [420, 216, 440, 368] },
  // Side by side: the same board as Lookback, so nothing seems to move (kept over B2's layout, Nov 23, 2026).
  // The original stays where it was, on the right, and the take takes the side panel's place on the left
  // (eyebrows 24 above each). The play bar is 16 under them and the mode panel 8 under that (as in B2's render),
  // right-aligned to the video.
  M: { video: VIDEO_BESIDE, take: [468, 40, 300, 520], sbsBar: [468, 576, 624, 48], controls: [520, 632, 572, 144] },
  // Lookback countdown: the 152-wide column 32 left of the video, then the section records like Playthrough.
  K: { countdown: [608, 236, 152, 192], video: VIDEO_FULL, progress: PROGRESS },
}

/** A Full run plays on B with From the top's section bar in place of the progress bar. */
const FULL_RUN: Partial<Record<PanelId, PxRect>> = { video: VIDEO_FULL, segBar: SEG_BAR }

/** The panels on screen for a view state: its screen's, except for a Full run playing. */
export function panelsFor(view: { screen: ScreenId; runKind: RunKind }): Partial<Record<PanelId, PxRect>> {
  return view.screen === "B" && view.runKind === "full" ? FULL_RUN : SCREENS[view.screen]
}

/** This prototype point sits at the placement point. */
export const ANCHOR = { x: 940, y: 306 }

/** Pop-ups open this far in front of you and this far below eye level, and follow when you turn more than followDeg away. */
export const POPUP = {
  distanceCm: 100,
  dropCm: 5,
  followDeg: 30,
}

/** "Record lookback?" opens a little farther out than Routine done, and is scaled down so it takes less of the view. */
export const RECORD_POPUP = {
  distanceCm: 120,
  dropCm: 5,
  scale: 0.5,
}

/** The dance picker opens in front of you like a pop-up, but farther out: its 3:4 card is 480×640 px (72×96 cm). */
export const PICKER = {
  distanceCm: 200,
  dropCm: 5,
}

/**
 * The count-in isn't on the board either: it opens centred in front of you, wherever the window is,
 * and follows (like a pop-up) once you turn more than followDeg away. It's B2's 152×192 column (BUILD_SPEC §6.12).
 */
export const COUNT_IN = {
  distanceCm: 200,
  dropCm: 0,
  followDeg: 10,
  /** How far it reaches from the column's centre: each side, up and down, in prototype px (half of 152×192). */
  halfWidth: 76,
  reachUp: 96,
  reachDown: 96,
  /** When it slides clear of the video, the space it keeps from the video's edge (prototype px at its distance): the "beside the video" tier. */
  videoGap: 32,
}

/** Centimetres per prototype pixel (1 px = 1.5 mm). */
export const CM_PER_PX = 0.15

/**
 * Default window placement relative to where you stand and face at start (picked by dragging it in Preview),
 * used until you move or resize the window; after that, your placement is saved and restored.
 */
export const PLACEMENT: Placement = {
  distanceCm: 324,
  yawRightDeg: 7,
  dropCm: 10,
  scale: 1,
}

/** A panel's centre and size in centimetres on the window plane (x right, y up), relative to the anchor. */
export function panelCm(rect: PxRect): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = rect
  return {
    x: (x + w / 2 - ANCHOR.x) * CM_PER_PX,
    y: -(y + h / 2 - ANCHOR.y) * CM_PER_PX,
    w: w * CM_PER_PX,
    h: h * CM_PER_PX,
  }
}

/** A point inside a panel, (x, y) px from its top-left corner, in centimetres relative to the anchor. */
export function pointInPanelCm(rect: PxRect, x: number, y: number): vec2 {
  return new vec2((rect[0] + x - ANCHOR.x) * CM_PER_PX, -(rect[1] + y - ANCHOR.y) * CM_PER_PX)
}

/** Prototype pixels → centimetres, for sizes inside a panel. */
export const pxToCm = (px: number) => px * CM_PER_PX
