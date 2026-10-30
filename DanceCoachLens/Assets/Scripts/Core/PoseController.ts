/**
 * PoseController: the Pose state machine, and its test seam.
 *
 * Like PlaybackController it knows nothing about the engine: the Lens sends it commands,
 * ticks it each frame while the mode is Pose, and renders the PoseView it returns.
 * PlaybackController owns the mode; the Lens enters this controller when the mode becomes Pose.
 *
 * Milestone 3 / M3-01: a placeholder. Pose opens on screen D for the section the dancer was on;
 * the video holds paused on the section's start (PlaybackController's video request) under the
 * "POSE · FROZEN" tag. Stills, stepping and the Pose bar come in the later M3 tickets.
 */

/** What the Lens shows in Pose. */
export interface PoseView {
  /** D: the frozen frame with the thin scrub line. */
  screen: "D"
  section: number
}

export class PoseController {
  private state: PoseView = { screen: "D", section: 1 }

  get view(): PoseView {
    return this.state
  }

  /** Opens Pose on section n. */
  enter(section: number): PoseView {
    this.state = { screen: "D", section }
    return this.state
  }

  /** Advances by dtSec of real time. Nothing moves in the placeholder. */
  tick(_dtSec: number): PoseView {
    return this.state
  }
}
