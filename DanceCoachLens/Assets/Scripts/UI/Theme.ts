/**
 * Theme tokens: the one source of colours, radii, type sizes and spacing.
 * Seeded from the dark ("Specs dark") theme of the wireframe preview in spectacles-preview/.
 * Sizes are in prototype pixels (see Layout.ts for the conversion to world units).
 *
 * View components read from here and never hard-code a colour or size.
 */

export const COLORS = {
  panel: "#121212",
  video: "#262626",
  ink: "#F2F2EE",
  ink2: "#D0D0CA",
  stroke: "#8E8E89",
  muted: "#B9B9B3",
  soft: "#5E5E5A",
  chip: "#121212",
  countBg: "#000000B8",
  active: "#F2F2EE",
  activeInk: "#111111",
  on: "#34342F",
  done: "#1A1A1A",
  track: "#2E2E2E",
  /** The outline of sections a run won't reach, on the segmented bar. */
  ghostLine: "#3A3A36",
  /** Over the video during a lead-in (the end of the previous section plays dimmed). */
  dim: "#00000073",
  /** Over the video behind a pop-up. */
  scrim: "#000000B3",
} as const

export type ColorToken = keyof typeof COLORS

export const RADII = {
  video: 16,
  chip: 10,
  button: 11,
  progress: 3,
  segment: 4,
  banner: 12,
  tile: 10,
  bar: 18,
  control: 12,
  popup: 20,
  popupButton: 14,
  popupTile: 8,
} as const

export const TYPE = {
  countBadge: 44,
  countBadgeSub: 10,
  chip: 11,
  button: 12,
  countIn: 20,
  countInNumber: 110,
  countInLabel: 11,
  countInHead: 13,
  segLabel: 11,
  banner: 13,
  tile: 13,
  icon: 18,
  modeName: 13,
  modeNext: 10,
  toast: 14,
  finishSub: 9,
  popupHead: 12,
  popupTitle: 30,
  popupTile: 12,
  popupButton: 14,
} as const

export const SPACING = {
  /** Inset of badges and chips from the video's edges. */
  videoInset: 14,
  countBadge: 84,
  chipHeight: 20,
  chipGap: 6,
  /** The count-in circle's diameter, then the "SECTION n IN" label and the 5 6 7 8 row under it. */
  countInCircle: 200,
  countInLabelY: 216,
  countInRowY: 248,
  countInRowGap: 26,
  /** The line marking where the section starts on 1 along the progress bar. */
  progressMarker: 2,
  /** The segmented bar: each section's segment height, the gap between them, and the label line under them. */
  segHeight: 8,
  segGap: 4,
  segLabelY: 20,
  /** The banner's icon, from its left edge, and its text. */
  bannerIcon: 22,
  bannerText: 58,
  tileGap: 6,
  /** The control bar: padding around its items, the gap between them, and each item's width. */
  barPad: 12,
  controlGap: 8,
  control: { mode: 170, replay: 110, top: 150, speed: 132, toggle: 60, finish: 92 },
  modeDot: 7,
  modeDotGap: 11,
  /** The Routine done pop-up: padding, the title and section tiles under the heading, and the buttons. */
  popupPad: 28,
  popupTitleY: 46,
  popupTilesY: 80,
  popupTileHeight: 30,
  popupButtonsY: 126,
  popupButtonHeight: 64,
  popupButtonGap: 10,
} as const

/** "#RRGGBB" or "#RRGGBBAA" → [r, g, b, a] in 0–1. */
export function rgba(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "")
  const c = (i: number) => parseInt(h.substr(i, 2), 16) / 255
  return [c(0), c(2), c(4), h.length >= 8 ? c(6) : 1]
}
