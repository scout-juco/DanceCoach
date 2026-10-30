/**
 * CountCaller: which count to say out loud, and when.
 *
 * The count-in's 5, 6, 7, 8 are always called, as the badge always shows them. While a run
 * (or the first look) plays, each count from 1 to 8 is called on its beat when Counts is on.
 * A number is called once, as it starts; the "&"s and Clip ended are silent.
 * In Pose each step calls its count once, whatever the Counts setting: a number, or "&" (AND_CALL).
 *
 * Pure logic: no Lens Studio APIs.
 */
import { ViewState } from "./PlaybackController"
import { PoseView } from "./PoseController"

/** What a step on an "&" says: the "and" clip, after the eight numbers. */
export const AND_CALL = 9

export class CountCaller {
  private lastKey = ""
  private lastStepId = 0

  /** Given Pose's view each frame, returns what its latest step says (1–8, or AND_CALL), once; 0 for nothing new. */
  nextStep(pose: PoseView): number {
    if (pose.stepId === this.lastStepId) return 0
    this.lastStepId = pose.stepId
    // Entering Pose starts the ids again from 0, and says nothing.
    if (pose.stepId === 0) return 0
    return pose.step % 2 ? AND_CALL : pose.step / 2 + 1
  }

  /** Given each frame's view state, returns the number to say now (1â€“8), or 0 for nothing new. */
  next(view: ViewState): number {
    const n = spokenCount(view)
    if (n === 0) {
      this.lastKey = ""
      return 0
    }
    // A new seek is a new run, so a replay calls its 5 again; a new section calls its 1 again.
    const key = `${view.video.seekId}|${view.countIn ? "in" : view.runSection}|${n}`
    if (key === this.lastKey) return 0
    this.lastKey = key
    return n
  }
}

/** The count being said in this view state, or 0 when nothing should be heard. */
export function spokenCount(view: ViewState): number {
  if (view.countIn) return view.countIn.number
  const playing = view.screen === "PV" || view.screen === "B" || view.screen === "F"
  return playing && view.settings.counts ? view.count : 0
}
