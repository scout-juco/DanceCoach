/**
 * Layout: panel rectangles keyed by the prototype's screen IDs, in prototype pixels
 * (the 1280×800 "Spectacles view" frames). Copied from SCREENS in spectacles-preview/index.html.
 *
 * Pixels become world units around ANCHOR: 1 px = 1.5 mm, and the anchor sits at the
 * placement point (PLACEMENT: 3.24 m away, 7° to the right and 0.10 m below eye level).
 * Lens Studio world units are centimetres.
 */
import { RunKind, ScreenId } from "../Core/PlaybackController"

/** [x, y, width, height] in prototype pixels. */
export type PxRect = [number, number, number, number]

export type PanelId = "video" | "progress" | "ciHead" | "countIn" | "segBar" | "banner" | "sections" | "controls" | "toast" | "skip" | "popup"

export const SCREENS: Record<ScreenId, Partial<Record<PanelId, PxRect>>> = {
  // First look plays like From the top (the preview has no PV frame): its banner, the segmented bar,
  // and "Skip to Section 1" under them.
  PV: { banner: [790, 20, 340, 40], video: [790, 72, 340, 572], segBar: [790, 660, 340, 26], skip: [790, 712, 340, 44] },
  BI: { video: [790, 40, 340, 604], progress: [790, 662, 340, 6], ciHead: [540, 150, 220, 20], countIn: [540, 200, 220, 262] },
  B0: { video: [790, 40, 340, 604], progress: [790, 662, 340, 6], countIn: [540, 200, 220, 262] },
  B: { video: [790, 40, 340, 604], progress: [790, 662, 340, 6] },
  F: { banner: [790, 20, 340, 40], video: [790, 72, 340, 572], segBar: [790, 660, 340, 26] },
  // The controls' width is 0: the bar sizes itself to its buttons. The toast sits left of the video, above the
  // section row (the preview floats it in front of you; that arrives with the pop-ups).
  C: { video: [790, 40, 300, 533], sections: [600, 589, 490, 40], controls: [360, 645, 0, 84], toast: [360, 525, 420, 48] },
  C2: { video: [790, 40, 300, 533], sections: [600, 589, 490, 40], controls: [360, 645, 0, 84], toast: [360, 525, 420, 48] },
  // The pop-up isn't on the board: it opens in front of you (POPUP), so only its size counts.
  G: { video: [790, 40, 340, 604], popup: [0, 0, 640, 248] },
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

/** Centimetres per prototype pixel (1 px = 1.5 mm). */
export const CM_PER_PX = 0.15

/** Default window placement relative to where you stand and face at start (picked by dragging it in Preview). */
export const PLACEMENT = {
  distanceCm: 324,
  yawRightDeg: 7,
  dropCm: 10,
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
