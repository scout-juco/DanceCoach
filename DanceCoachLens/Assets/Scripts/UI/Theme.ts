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
  /** Over the video during a lead-in (the end of the previous section plays dimmed). */
  dim: "#00000073",
} as const

export type ColorToken = keyof typeof COLORS

export const RADII = {
  video: 16,
  chip: 10,
  tag: 11,
  button: 11,
  progress: 3,
  tile: 10,
} as const

export const TYPE = {
  countBadge: 44,
  countBadgeSub: 10,
  chip: 11,
  tag: 11,
  button: 12,
  countIn: 20,
  countInNumber: 110,
  countInLabel: 11,
  countInHead: 13,
  progLabel: 11,
  tile: 13,
} as const

export const SPACING = {
  /** Inset of badges, chips and tags from the video's edges. */
  videoInset: 14,
  countBadge: 84,
  chipHeight: 20,
  tagHeight: 22,
  chipGap: 6,
  /** The count-in circle's diameter, and the 5 6 7 8 row under it. */
  countInCircle: 200,
  countInRowY: 226,
  countInRowGap: 26,
  /** The line marking where the section starts on 1 along the progress bar. */
  progressMarker: 2,
  tileGap: 6,
} as const

/** "#RRGGBB" or "#RRGGBBAA" → [r, g, b, a] in 0–1. */
export function rgba(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "")
  const c = (i: number) => parseInt(h.substr(i, 2), 16) / 255
  return [c(0), c(2), c(4), h.length >= 8 ? c(6) : 1]
}
