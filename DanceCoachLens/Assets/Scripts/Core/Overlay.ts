/**
 * Overlay rules (BUILD_SPEC §6 and §7): what sits on and around the video window in each state.
 *
 * Pure: overlayFor() is the only thing the video's view components ask. It takes the view the Lens
 * renders (the screen already says D/E in Pose and I/L/J/K/M in Lookback) and says which outline,
 * pills, lock, count ring, scale handles and control panel to show.
 */
import { ViewState } from "./PlaybackController"
import { LookbackView } from "./LookbackController"
import { PoseView } from "./PoseController"

/** The video outline: lime while a clip plays, pink in a Lookback recording, grey (no visible outline) otherwise. */
export type OutlineColor = "volt" | "pink" | "control"

/** A settings pill on the scrim, or the one pink Lookback pill. */
export interface OverlayPill {
  label: string
  tone: "scrim" | "pink"
}

/** The control panel under the video: hidden while locked, the thin scrub alone (Pose D), or the whole panel. */
export type PanelState = "hidden" | "scrub" | "full"

export interface RingView {
  color: "volt" | "pink"
  /** The count on show: 1–8, and the ring fills count / 8, a step at a time. */
  count: number
  /** The number in the middle: the count, or Pose's "1&". */
  label: string
}

export interface Overlay {
  outline: OutlineColor
  pills: OverlayPill[]
  /** The padlock bottom-left: controls are locked (a clip is playing or counting in). */
  lock: boolean
  /** The count ring top-right, or null. */
  ring: RingView | null
  /** The L-brackets on the top-left and bottom-right corners. */
  handles: boolean
  panel: PanelState
}

/** The screens where a clip plays or counts in, so the controls are locked. K is Lookback's countdown, then its recording. */
const LOCKED = new Set(["PV", "BI", "B0", "B", "F", "K"])
/** The screens where a Playthrough, From the top or first-look clip plays (lime outline). */
const PLAYING = new Set(["PV", "B", "F"])
/** The screens that show a window you can resize: unlocked, nothing in front of it. */
const RESIZABLE = new Set(["C", "C2", "D", "E", "I", "L"])

const speedPill = (speed: number): OverlayPill => ({ label: `${speed}×`, tone: "scrim" })
const MIRRORED: OverlayPill = { label: "MIRRORED", tone: "scrim" }
export const LOOKBACK_PILL: OverlayPill = { label: "Lookback", tone: "pink" }

/** The pills, top-left: settings in Playthrough and Pose, only the pink Lookback pill in Lookback. Never while a clip plays. */
function pillsFor(view: ViewState): OverlayPill[] {
  switch (view.screen) {
    case "C":
    case "C2": {
      const pills: OverlayPill[] = view.settings.speed !== 1 ? [speedPill(view.settings.speed)] : []
      if (view.settings.mirror) pills.push(MIRRORED)
      return pills
    }
    // Pose has no speed.
    case "D":
    case "E":
      return view.settings.mirror ? [MIRRORED] : []
    case "I":
    case "L":
      return [LOOKBACK_PILL]
    default:
      return []
  }
}

function panelFor(screen: ViewState["screen"]): PanelState {
  switch (screen) {
    case "C":
    case "C2":
    case "E":
    case "I":
    case "L":
    case "M":
      return "full"
    case "D":
      return "scrub"
    default:
      return "hidden"
  }
}

/** The count on show and its label, or null when the ring has nothing to say. */
function ringFor(view: ViewState, pose: PoseView | null, look: LookbackView | null, isTake: boolean): RingView | null {
  // Counts off hides the ring everywhere. During a count-in the 5 6 7 8 shows beside the video instead.
  if (!view.settings.counts || view.countIn || view.screen === "BI" || view.screen === "B0") return null
  const color = isTake || isLookbackScreen(view.screen) ? "pink" : "volt"
  if (view.screen === "M") {
    const sbs = look && look.sideBySide
    return sbs && sbs.count > 0 ? { color: isTake ? "pink" : "volt", count: sbs.count, label: String(sbs.count) } : null
  }
  if (view.screen === "K") {
    // The countdown 3 2 1 is beside the video; the ring comes in once the section records.
    if (!look || !look.record || (look.record.phase !== "recording" && look.record.phase !== "saving")) return null
  }
  if (pose && (view.screen === "D" || view.screen === "E")) {
    const count = Math.floor(pose.step / 2) + 1
    return { color, count, label: `${count}${pose.step % 2 ? "&" : ""}` }
  }
  return view.count > 0 ? { color, count: Math.min(view.count, 8), label: String(view.count) } : null
}

const isLookbackScreen = (screen: string) => screen === "I" || screen === "L" || screen === "J" || screen === "K" || screen === "M"

/**
 * What shows on the video in this state. `isTake` is for side by side's second window, the take on the left:
 * its outline and ring are pink where the original's (the right-hand window) are lime.
 */
export function overlayFor(view: ViewState, pose: PoseView | null = null, look: LookbackView | null = null, isTake = false): Overlay {
  const outline: OutlineColor =
    view.screen === "M" ? (isTake ? "pink" : "volt") : view.screen === "K" ? "pink" : PLAYING.has(view.screen) ? "volt" : "control"
  const locked = LOCKED.has(view.screen)
  return {
    outline,
    pills: isTake ? [] : pillsFor(view),
    lock: locked && !isTake,
    ring: ringFor(view, pose, look, isTake),
    handles: RESIZABLE.has(view.screen) && !isTake,
    panel: panelFor(view.screen),
  }
}
