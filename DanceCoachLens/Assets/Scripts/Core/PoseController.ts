/**
 * PoseController: the Pose state machine, and its test seam.
 *
 * Like PlaybackController it knows nothing about the engine: the Lens sends it commands,
 * ticks it each frame while the mode is Pose, and renders the PoseView it returns.
 * PlaybackController owns the mode; the Lens enters this controller when the mode becomes Pose.
 *
 * Milestone 3 / M3-03: Pose opens on screen D for the section the dancer was on, on its count 1.
 * The Lens shows that count's still (a step is one half-count, 0 to 15, as in StillPlan) under the
 * "POSE · FROZEN" tag, with the thin scrub line below. Stepping and the Pose bar come in the later M3 tickets.
 */

/** What the Lens shows in Pose. */
export interface PoseView {
  /** D: the frozen frame with the thin scrub line. */
  screen: "D"
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

  get view(): PoseView {
    return this.state
  }

  /** Opens Pose on section n. */
  enter(section: number): PoseView {
    this.state = { screen: "D", section, step: 0 }
    return this.state
  }

  /** Advances by dtSec of real time. Nothing moves yet. */
  tick(_dtSec: number): PoseView {
    return this.state
  }
}
