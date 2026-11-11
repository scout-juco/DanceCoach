/**
 * LookbackController: the Lookback state machine, and its test seam.
 *
 * Like PoseController it knows nothing about the engine: the Lens sends it commands, ticks it each
 * frame while the mode is Lookback, and renders the LookbackView it returns. PlaybackController owns
 * the mode; the Lens enters this controller when the mode becomes Lookback.
 *
 * M4-05: Lookback opens on screen I (no takes for the section) or L (some). On L the newest take is
 * selected; the ATTEMPTS row shows the last four takes and tapping one selects it. The glasses poll
 * the server's recorder status while here; tick says when a poll is due.
 */
import { Take } from "./TakesClient"

/** How often the recorder status is polled, in seconds. */
export const STATUS_POLL_SEC = 0.5
/** How many takes the ATTEMPTS row shows. */
export const ATTEMPTS_SHOWN = 4

/** What the Lens shows in Lookback. */
export interface LookbackView {
  /** I: no takes for the section. L: takes, one selected. */
  screen: "I" | "L"
  section: number
  takes: Take[]
  /** Index in takes of the selected take, or -1 with none. */
  selected: number
  /** The last ATTEMPTS_SHOWN takes, oldest first, for the ATTEMPTS row. */
  attempts: Take[]
  /** The phone camera has polled the server recently. */
  phoneConnected: boolean
}

/** A take's label, e.g. "TAKE 3 · 0.75×". */
export function takeLabel(take: Take): string {
  return `TAKE ${take.number} · ${take.speed}×`
}

export class LookbackController {
  private state: LookbackView | null = null
  private sincePoll = 0

  /** The view while in Lookback, or null outside it. */
  get view(): LookbackView | null {
    return this.state
  }

  /** Opens Lookback on section n with the takes the server has for it. */
  enter(section: number, takes: Take[] = []): LookbackView {
    this.sincePoll = 0
    this.state = this.make(section, takes, takes.length - 1, false)
    return this.state
  }

  /** Back out of Lookback: nothing is polled any more. */
  leave() {
    this.state = null
  }

  /** The section's takes arrived (the listing finished after entering). Keeps the selected take if it's still there. */
  setTakes(takes: Take[]): LookbackView | null {
    const s = this.state
    if (!s) return null
    const keep = s.selected >= 0 ? takes.findIndex((t) => t.name === s.takes[s.selected].name) : -1
    this.state = this.make(s.section, takes, keep >= 0 ? keep : takes.length - 1, s.phoneConnected)
    return this.state
  }

  /** Selects the take at `index` in the ATTEMPTS row's visible window (0 is the oldest shown). */
  selectAttempt(index: number): LookbackView | null {
    const s = this.state
    if (!s || index < 0 || index >= s.attempts.length) return s
    return this.selectTake(s.takes.length - s.attempts.length + index)
  }

  /** Selects the take at `index` in takes. */
  selectTake(index: number): LookbackView | null {
    const s = this.state
    if (!s || index < 0 || index >= s.takes.length) return s
    this.state = { ...s, selected: index }
    return this.state
  }

  /** The recorder status says whether the phone is connected. */
  phoneStatus(connected: boolean): LookbackView | null {
    const s = this.state
    if (!s) return null
    if (s.phoneConnected !== connected) this.state = { ...s, phoneConnected: connected }
    return this.state
  }

  /** One frame on. Returns true when a status poll is due; never while outside Lookback. */
  tick(dtSec: number): boolean {
    if (!this.state) return false
    this.sincePoll += dtSec
    if (this.sincePoll < STATUS_POLL_SEC) return false
    this.sincePoll = 0
    return true
  }

  private make(section: number, takes: Take[], selected: number, phoneConnected: boolean): LookbackView {
    return {
      screen: takes.length ? "L" : "I",
      section,
      takes,
      selected: takes.length ? selected : -1,
      attempts: takes.slice(-ATTEMPTS_SHOWN),
      phoneConnected,
    }
  }
}
