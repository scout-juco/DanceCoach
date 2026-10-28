/** The adjust page's overlay text. It reads the lens's own CountClock, so the preview and the glasses agree. */
import { CountClock } from "../../DanceCoachLens/Assets/Scripts/Core/CountClock"

export function overlayLabel(clock: CountClock, t: number): string {
  if (clock.isPastFootage(t)) return "Clip ended"
  const { section, count } = clock.at(t)
  return section === 0 ? "Before section 1" : `Section ${section} · count ${count}`
}
