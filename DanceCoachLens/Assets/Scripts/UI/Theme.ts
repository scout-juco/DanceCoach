/**
 * Theme tokens: the one source of colours, radii, type and spacing, from the B2 · Pulse
 * handoff (design/b2-handoff/tokens.json and BUILD_SPEC.md §3–5).
 * Sizes are in prototype pixels (see Layout.ts for the conversion to world units).
 *
 * View components read from here and never hard-code a colour, font or size.
 *
 * The wireframe tokens (LEGACY_*) stay only as aliases until their last readers move to B2;
 * they're deleted in the M5 clean-up (#53).
 */

/** The B2 colours. Spectacles only add light: black is see-through, so nothing relies on it being seen. */
export const B2_COLORS = {
  /** Live, primary, current: the playing outline, count ring, current section, primary buttons. */
  volt: "#D4FF3A",
  /** Lookback only: its mode, chip, ring, outline, countdown, "Yes, record" and +. Only ever a fill or a 4 px outline. */
  pink: "#FF5FA8",
  /** Text and icons on volt, pink or white (a see-through knockout on device). */
  onColor: "#0E0F10",
  /** Primary text and icons; selected / on fills. */
  text: "#FFFFFF",
  /** Secondary text, inactive mode segments, body copy. */
  textMuted: "#C9CCD1",
  /** Eyebrows and the scale handles. */
  textSubtle: "#9EA3AA",
  /** Count-in numbers not reached yet. */
  textDisabled: "#7A8088",
  /** Glass panels at 85%. */
  panel: "#23262BD9",
  /** The panel colour where alpha isn't wanted: dialogs, side panels. */
  panelSolid: "#23262B",
  /** Recessed: the mode track, the count ring's centre, the step-size track. */
  track: "#16181B",
  /** Idle: secondary buttons, the ring track, the idle video outline and the video's background. */
  control: "#3A3F46",
  /** 1 px panel outlines. */
  border: "#3A3F46",
  /** Count-in bars not reached yet; the disabled ›. */
  tickOff: "#6B7179",
  /** Behind the pills and lock that sit on the video. */
  scrim: "#0E0F1099",
} as const

/**
 * Wireframe colour names, now pointing at the nearest B2 colour so the old views take on the palette
 * until they're rebuilt. Don't use these in new code.
 */
const LEGACY_COLORS = {
  video: B2_COLORS.control,
  ink: B2_COLORS.text,
  ink2: B2_COLORS.textMuted,
  stroke: B2_COLORS.border,
  muted: B2_COLORS.textMuted,
  soft: B2_COLORS.tickOff,
  chip: B2_COLORS.scrim,
  countBg: B2_COLORS.scrim,
  active: B2_COLORS.volt,
  activeInk: B2_COLORS.onColor,
  on: B2_COLORS.control,
  done: B2_COLORS.panelSolid,
  /** The outline of sections a run won't reach, on the segmented bar. */
  ghostLine: B2_COLORS.border,
  /** Over the video during a lead-in (the end of the previous section plays dimmed). */
  dim: "#00000073",
} as const

export const COLORS = { ...LEGACY_COLORS, ...B2_COLORS } as const

export type ColorToken = keyof typeof COLORS

/** Corner radii. Pills (buttons, segments, tiles, chips, the ring) use PILL: half their height. */
export const RADIUS = {
  /** Count-in bars, progress and section bars. */
  sm: 4,
  /** Small cards: the picker's thumbnails. */
  md: 16,
  /** Dialogs, the take card, the picker's cards. */
  lg: 24,
  /** The video window, the mode panel, side panels. */
  xl: 32,
  pill: 999,
} as const

/** The spacing tiers (BUILD_SPEC §5). Pick by the relationship between two things, not by eye. */
export const SPACE = {
  /** Inside a control: the mode-track inset, between segments. */
  control: 4,
  /** Inside a group: panel padding and its row gap, between chips and section tiles, a caption under its bar. */
  group: 8,
  /** Between controls: buttons in a row, take buttons. */
  between: 12,
  /** Attached: a bar under the video; scale brackets off the video's corners. */
  attached: 16,
  /** Chips and the ring inset from the video's edge. */
  videoInset: 20,
  /** Between surfaces: video, section tiles, mode panel, side panel. */
  surface: 24,
  /** Beside the video: the count-in or countdown column to the video. */
  beside: 32,
} as const

/** Fixed component sizes (tokens.json "size"). */
export const SIZE = {
  /** Buttons and section tiles are this tall; icon buttons this wide. */
  control: 56,
  /** A mode segment inside its track. */
  segment: 48,
  icon: 24,
  /** The count ring's diameter, its stroke and its centre disc. */
  ring: 96,
  ringStroke: 8,
  ringCentre: 80,
  /** A settings pill or the lock on the video. */
  chip: 36,
  tileMin: 72,
  /** Count-in bars: height, and width when done/upcoming or current. */
  bar: 8,
  barWidth: 24,
  barWidthCurrent: 40,
  /** The video window's outline. */
  outline: 4,
} as const

export type FontFamily = "sora" | "inter"

/** A named text style: font, size and line height (px), weight, and the extras some styles need. */
export interface TextStyle {
  family: FontFamily
  size: number
  lineHeight: number
  weight: 400 | 500 | 600 | 700 | 800
  /** Letter spacing in em. */
  letterSpacing?: number
  uppercase?: boolean
  /** Use the tabular-digit cut of the font, so counts don't jitter. */
  tabular?: boolean
}

/** The B2 type scale (BUILD_SPEC §4, checked against layout.json). Sora is read at a glance; Inter is for sentences. */
const styles = <T extends Record<string, TextStyle>>(t: T) => t

export const TEXT = styles({
  titleXl: { family: "sora", size: 40, lineHeight: 48, weight: 800 },
  countXl: { family: "sora", size: 40, lineHeight: 40, weight: 800, tabular: true },
  heading: { family: "sora", size: 24, lineHeight: 32, weight: 800 },
  countMd: { family: "sora", size: 24, lineHeight: 32, weight: 700, tabular: true },
  /** Buttons, segments and tiles; buttonStrong on volt, pink or white fills and selected segments. */
  button: { family: "sora", size: 16, lineHeight: 24, weight: 600 },
  buttonStrong: { family: "sora", size: 16, lineHeight: 24, weight: 700 },
  /** Numbers on buttons: take numbers, "5 / 5", speed. */
  buttonCount: { family: "sora", size: 16, lineHeight: 24, weight: 700, tabular: true },
  chip: { family: "sora", size: 14, lineHeight: 20, weight: 700 },
  body: { family: "inter", size: 16, lineHeight: 24, weight: 400 },
  caption: { family: "inter", size: 14, lineHeight: 20, weight: 500 },
  /** Labels under bars: section numbers, Pose's 1 & 2 &…, "reach here for controls". */
  label: { family: "inter", size: 12, lineHeight: 16, weight: 600 },
  eyebrow: { family: "inter", size: 12, lineHeight: 16, weight: 700, letterSpacing: 0.14, uppercase: true },
})

export type TextStyleName = keyof typeof TEXT

/** The font file for a style: Assets/Fonts/<Family>-<weight>[-tab].ttf. Sora is cut in 600–800 and Inter in 400–700. */
export function fontFile(style: TextStyle): string {
  const family = style.family === "sora" ? "Sora" : "Inter"
  const weights = style.family === "sora" ? [600, 700, 800] : [400, 500, 600, 700]
  const weight = weights.reduce((best, w) => (Math.abs(w - style.weight) < Math.abs(best - style.weight) ? w : best))
  return `${family}-${weight}${style.tabular ? "-tab" : ""}.ttf`
}

// ---- Wireframe tokens, kept until their readers move to B2 (#53). ----

export const RADII = {
  video: RADIUS.xl,
  chip: 10,
  button: 11,
  progress: RADIUS.sm,
  segment: RADIUS.sm,
  banner: 12,
  tile: 10,
  bar: 18,
  control: 12,
  popup: RADIUS.lg,
  popupButton: 14,
  popupTile: 8,
} as const

/** Wireframe type sizes in px; makeText still takes one of these until each view moves to a TEXT style. */
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
  /** The dance picker: its title, a tile's title and the difficulty pill on its thumbnail. */
  pickerTitle: 24,
  pickerTile: 15,
  pickerPill: 11,
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
  tileGap: 8,
  /** The control bar: padding around its items, the gap between them, and each item's width. */
  barPad: 12,
  controlGap: 8,
  control: { mode: 170, replay: 110, top: 150, speed: 132, toggle: 60, finish: 92, cycle: 84, action: 112 },
  /** The control bar's buttons are this tall. */
  controlHeight: 56,
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
