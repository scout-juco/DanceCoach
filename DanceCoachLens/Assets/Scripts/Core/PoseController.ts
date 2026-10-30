/**
 * PoseController: the Pose state machine, and its test seam.
 *
 * Like PlaybackController it knows nothing about the engine: the Lens sends it commands,
 * ticks it each frame while the mode is Pose, and renders the PoseView it returns.
 * PlaybackController owns the mode; the Lens enters this controller when the mode becomes Pose.
 *
 * Milestone 3 / M3-03: Pose opens on screen D for the section the dancer was on, on its count 1.
 * The Lens shows that count's still (a step is one half-count, 0 to 15, as in StillPlan) under the
 * "POSE · FROZEN" tag, with the thin scrub line below. Stepping comes in a later M3 ticket.
 *
 * M3-04: aiming at the scrub line expands it into the Pose bar (screen E). The bar collapses back to
 * screen D once POSE_BAR_HIDE_SEC pass with nothing aimed at it; using any control on it starts that wait again.
 */

/** How long the Pose bar stays open with nothing aimed at it. Tune on device. */
export const POSE_BAR_HIDE_SEC = 3

/** What the Lens shows in Pose. */
export interface PoseView {
  /** D: the frozen frame with the thin scrub line. E: the same with the Pose bar open. */
  screen: "D" | "E"
  section: number
  /** The step on show: 0 to 15, count 1, 1&, 2, … 8&. */
  step: number
}

/** A step's count as the badge shows it: 1, 1&, 2, … */
export function stepCountLabel(step: number): string {
  return `${Math.floor(step / 2) + 1}${step % 2 ? "&" : ""}`
}

/** The thin scrub line's label, e.g. "SECTION 2 · COUNT 5&". */
export function scrubLabel(view: PoseView): string {
  return `SECTION ${view.section} · COUNT ${stepCountLabel(view.step)}`
}

export class PoseController {
  private state: PoseView = { screen: "D", section: 1, step: 0 }
  /** Seconds the bar has gone without being aimed at or used. */
  private idleSec = 0

  get view(): PoseView {
    return this.state
  }

  /** Opens Pose on section n. */
  enter(section: number): PoseView {
    this.idleSec = 0
    this.state = { screen: "D", section, step: 0 }
    return this.state
  }

  /** The hand ray is on the scrub line or the bar: open the bar, and keep it open while this keeps coming. */
  aim(): PoseView {
    this.idleSec = 0
    if (this.state.screen !== "E") this.state = { ...this.state, screen: "E" }
    return this.state
  }

  /** A control on the open bar was used: the wait to collapse starts again. */
  use(): PoseView {
    this.idleSec = 0
    return this.state
  }

  /** Advances by dtSec of real time: an open bar nobody is aiming at collapses after POSE_BAR_HIDE_SEC. */
  tick(dtSec: number): PoseView {
    if (this.state.screen === "E") {
      this.idleSec += dtSec
      if (this.idleSec >= POSE_BAR_HIDE_SEC) this.state = { ...this.state, screen: "D" }
    }
    return this.state
  }
}
