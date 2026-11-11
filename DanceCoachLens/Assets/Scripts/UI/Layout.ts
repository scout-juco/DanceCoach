/**
 * Layout: panel rectangles keyed by the prototype's screen IDs, in prototype pixels
 * (the 1280×800 "Spectacles view" frames). Copied from SCREENS in spectacles-preview/index.html.
 *
 * Pixels become world units around ANCHOR: 1 px = 1.5 mm, and the anchor sits at the
 * placement point (PLACEMENT: 3.24 m away, 7° to the right and 0.10 m below eye level).
 * Lens Studio world units are centimetres.
 */
import { RunKind, ScreenId } from "../Core/PlaybackController"
import { Placement } from "../Core/WindowPlacement"

/** [x, y, width, height] in prototype pixels. */
export type PxRect = [number, number, number, number]

export type PanelId = "video" | "progress" | "segBar" | "banner" | "sections" | "controls" | "poseLine" | "poseBar" | "lookPanel" | "attempts" | "countdown" | "toast" | "skip" | "popup"

export const SCREENS: Record<ScreenId, Partial<Record<PanelId, PxRect>>> = {
  // First look plays like From the top (the preview has no PV frame): its banner, the segmented bar,
  // and "Skip to Section 1" under them.
  PV: { banner: [790, 20, 340, 40], video: [790, 72, 340, 572], segBar: [790, 660, 340, 26], skip: [790, 712, 340, 44] },
  BI: { video: [790, 40, 340, 604], progress: [790, 662, 340, 6] },
  B0: { video: [790, 40, 340, 604], progress: [790, 662, 340, 6] },
  B: { video: [790, 40, 340, 604], progress: [790, 662, 340, 6] },
  F: { banner: [790, 20, 340, 40], video: [790, 72, 340, 572], segBar: [790, 660, 340, 26] },
  // The controls' width is 0: the bar sizes itself to its buttons. The toast sits left of the video, above the
  // section row (the preview floats it in front of you; that arrives with the pop-ups).
  C: { video: [790, 40, 300, 533], sections: [600, 589, 490, 40], controls: [360, 645, 0, 84], toast: [360, 525, 420, 48] },
  C2: { video: [790, 40, 300, 533], sections: [600, 589, 490, 40], controls: [360, 645, 0, 84], toast: [360, 525, 420, 48] },
  // The pop-up isn't on the board: it opens in front of you (POPUP), so only its size counts.
  G: { video: [790, 40, 340, 604], popup: [0, 0, 640, 248] },
  // Pose: the frozen video, the thin scrub line with its label under it and, left of the video's bottom corner,
  // a bar with only the mode button for now. The Pose bar (screen E) replaces that bar in a later M3 ticket.
  D: { video: [790, 40, 340, 604], poseLine: [790, 662, 340, 6], controls: [580, 560, 0, 84] },
  // Pose, open: the video shrinks to Clip ended's size and the Pose bar sits below it.
  E: { video: [790, 40, 300, 533], poseBar: [520, 590, 740, 128] },
  // Lookback, no takes: the look panel (a little smaller than the video, top-aligned with it) beside the video, the ATTEMPTS row under them and the bar under that.
  I: { video: [790, 40, 300, 533], lookPanel: [500, 40, 270, 480], attempts: [470, 583, 620, 52], controls: [470, 645, 0, 84], toast: [470, 525, 420, 48] },
  // Lookback with takes: the same board; the look panel shows the selected take and the ATTEMPTS row the last four.
  L: { video: [790, 40, 300, 533], lookPanel: [500, 40, 270, 480], attempts: [470, 583, 620, 52], controls: [470, 645, 0, 84], toast: [470, 525, 420, 48] },
  // "Record lookback?" over I or L, with no bar (the board is locked behind it). Like Routine done it opens in front of you, so only its size counts.
  J: { video: [790, 40, 300, 533], lookPanel: [500, 40, 270, 480], attempts: [470, 583, 620, 52], popup: [0, 0, 440, 330] },
  // Recording: the 3, 2, 1 beside the video, which grows to Playing's size, with its progress line. No controls: they're locked.
  K: { countdown: [560, 200, 200, 200], video: [790, 40, 340, 604], progress: [790, 662, 340, 6] },
}

/** A Full run plays on B with From the top's segmented bar in place of the progress bar. */
const FULL_RUN: Partial<Record<PanelId, PxRect>> = { video: [790, 40, 340, 604], segBar: [790, 660, 340, 26] }

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

/** "Record lookback?" opens farther out than Routine done, and is scaled up to stay easy to read there. */
export const RECORD_POPUP = {
  distanceCm: 250,
  dropCm: 5,
  scale: 1.8,
}

/** The dance picker opens in front of you like a pop-up, but farther out: its 3:4 card is 480×640 px (72×96 cm). */
export const PICKER = {
  distanceCm: 200,
  dropCm: 5,
}

/**
 * The count-in isn't on the board either: it opens centred in front of you, wherever the window is,
 * and follows (like a pop-up) once you turn more than followDeg away.
 */
export const COUNT_IN = {
  distanceCm: 200,
  dropCm: 0,
  followDeg: 10,
  /** The starting-pose heading's centre, above the circle's centre (prototype px). */
  headUp: 140,
  /** How far it reaches from the circle's centre: each side (the heading), up and down (the 5 6 7 8 row), in prototype px. */
  halfWidth: 110,
  reachUp: 152,
  reachDown: 262,
  /** When it slides clear of the video, the space it keeps from the video's edge (prototype px at its distance). */
  videoGap: 24,
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
