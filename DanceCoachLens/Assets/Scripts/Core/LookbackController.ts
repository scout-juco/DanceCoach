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
 *
 * M4-06: recording a take. The + and Record lookback open "Record lookback?" (J), which blocks Yes until the
 * phone is connected. Yes arms the take on the server, counts 3, 2, 1 (K), tells the server the run started and
 * plays the section; when it ends the take is stopped ("Saving take…") and, once the server has it, downloaded and
 * shown on L, selected and tagged NEW. The controller never talks to the server: it queues requests (takeRequests)
 * for the Lens to carry out and hears back through armed, recorderStatus and downloaded. A failure goes back to
 * I or L with a message.
 */
import { RecorderStatus, Take, TakeParams } from "./TakesClient"

/** How often the recorder status is polled, in seconds. */
export const STATUS_POLL_SEC = 0.5
/** How many takes the ATTEMPTS row shows. */
export const ATTEMPTS_SHOWN = 4
/** The 3, 2, 1 before the section plays. */
export const COUNTDOWN_FROM = 3
/** How long a take may stay on "Saving take…" before it's given up on, in seconds. */
export const SAVE_TIMEOUT_SEC = 60
/** How long a failure message stays up, in seconds. */
export const MESSAGE_SEC = 5

export const PHONE_DROPPED_MESSAGE = "The phone camera disconnected: open /record on your phone and try again"
export const SAVE_TIMEOUT_MESSAGE = "The take took too long to save: record again"
export const SAVE_FAILED_MESSAGE = "The take couldn't be saved: record again"

// Absorbs float error so a time exactly on the section's end ends it.
const EPS = 1e-6

/** Where a recording has got to: J's question, then K's phases. */
export type RecordPhase = "confirm" | "arming" | "countdown" | "recording" | "saving"

/** What the Lens should ask of the server. */
export type LookbackRequest =
  | { type: "arm"; params: TakeParams }
  | { type: "start"; sessionId: string }
  | { type: "stop"; sessionId: string }
  /** The take is ready on the server: download it, then call downloaded (or downloadFailed). */
  | { type: "download"; take: Take }

/** The section being recorded, as video seconds in the original. */
export interface SectionRange {
  start: number
  end: number
}

/** A recording in progress. */
export interface RecordView {
  phase: RecordPhase
  /** What the take will use: the speed and mirror it was started with. */
  speed: number
  mirror: boolean
  /** 3, 2 or 1 while counting down (3 while arming); 0 once recording. */
  countdown: number
  /** 0–1 through the section while recording. */
  progress: number
}

/** What the Lens shows in Lookback. */
export interface LookbackView {
  /** I: no takes for the section. L: takes, one selected. J: "Record lookback?" over either. K: recording. */
  screen: "I" | "L" | "J" | "K"
  section: number
  takes: Take[]
  /** Index in takes of the selected take, or -1 with none. */
  selected: number
  /** The last ATTEMPTS_SHOWN takes, oldest first, for the ATTEMPTS row. */
  attempts: Take[]
  /** The phone camera has polled the server recently. */
  phoneConnected: boolean
  /** The recording under way (J and K), or null. */
  record: RecordView | null
  /** Name of the take just recorded, tagged NEW until the next recording or leaving Lookback; null otherwise. */
  newTake: string | null
  /** Why the last recording failed; shown for a few seconds. */
  message: string | null
}

/** A take's label, e.g. "TAKE 3 · 0.75×", or "TAKE 3 · 0.75× · NEW" for the take just recorded. */
export function takeLabel(take: Take, isNew = false): string {
  return `TAKE ${take.number} · ${take.speed}×${isNew ? " · NEW" : ""}`
}

export class LookbackController {
  private state: LookbackView | null = null
  private sincePoll = 0
  private requests: LookbackRequest[] = []
  private range: SectionRange = { start: 0, end: 0 }
  private sessionId: string | null = null
  // Seconds into the countdown, or into saving.
  private elapsed = 0
  private messageLeft = 0
  private downloading = false

  /** The view while in Lookback, or null outside it. */
  get view(): LookbackView | null {
    return this.state
  }

  /** Opens Lookback on section n with the takes the server has for it. */
  enter(section: number, takes: Take[] = []): LookbackView {
    this.sincePoll = 0
    this.reset()
    this.state = this.make(section, takes, takes.length - 1, false)
    return this.state
  }

  /** Back out of Lookback: nothing is polled any more. */
  leave() {
    this.state = null
    this.reset()
  }

  /** The section's takes arrived (the listing finished after entering). Keeps the selected take if it's still there. */
  setTakes(takes: Take[]): LookbackView | null {
    const s = this.state
    if (!s) return null
    const keep = s.selected >= 0 ? takes.findIndex((t) => t.name === s.takes[s.selected].name) : -1
    const next = { ...this.make(s.section, takes, keep >= 0 ? keep : takes.length - 1, s.phoneConnected), record: s.record, newTake: s.newTake, message: s.message }
    this.state = { ...next, screen: this.screenOf(next) }
    return this.state
  }

  /** Selects the take at `index` in the ATTEMPTS row's visible window (0 is the oldest shown). */
  selectAttempt(index: number): LookbackView | null {
    const s = this.state
    if (!s || index < 0 || index >= s.attempts.length) return s
    return this.selectTake(s.takes.length - s.attempts.length + index)
  }

  /** Selects the take at `index` in takes. Ignored during a recording. */
  selectTake(index: number): LookbackView | null {
    const s = this.state
    if (!s || s.record || index < 0 || index >= s.takes.length) return s
    this.state = { ...s, selected: index }
    return this.state
  }

  /** The + or Record lookback: asks "Record lookback?" for a take at this speed and mirror of the section's range. Ignored mid-recording. */
  tapRecord(speed: number, mirror: boolean, range: SectionRange): LookbackView | null {
    const s = this.state
    if (!s || s.record) return s
    this.range = range
    this.messageLeft = 0
    this.state = { ...s, screen: "J", record: { phase: "confirm", speed, mirror, countdown: COUNTDOWN_FROM, progress: 0 }, newTake: null, message: null }
    return this.state
  }

  /** "Not now": back to I or L. Only on J. */
  cancel(): LookbackView | null {
    const s = this.state
    if (!s || !s.record || s.record.phase !== "confirm") return s
    return this.close(s)
  }

  /** "Yes, record": arms the take, and the phone starts filming. Ignored unless on J with the phone connected. */
  confirm(): LookbackView | null {
    const s = this.state
    if (!s || !s.record || s.record.phase !== "confirm" || !s.phoneConnected) return s
    this.requests.push({ type: "arm", params: { section: s.section, speed: s.record.speed, mirror: s.record.mirror } })
    this.state = { ...s, screen: "K", record: { ...s.record, phase: "arming" } }
    return this.state
  }

  /** The server armed the take: the 3, 2, 1 starts. */
  armed(sessionId: string): LookbackView | null {
    const s = this.state
    if (!s || !s.record || s.record.phase !== "arming") return s
    this.sessionId = sessionId
    this.elapsed = 0
    this.state = { ...s, record: { ...s.record, phase: "countdown", countdown: COUNTDOWN_FROM } }
    return this.state
  }

  /** The server wouldn't arm the take. */
  armFailed(reason: string): LookbackView | null {
    const s = this.state
    return s && s.record && s.record.phase === "arming" ? this.fail(reason) : s
  }

  /** The start or stop request didn't get through, so the take can't be trusted. */
  requestFailed(reason: string): LookbackView | null {
    const s = this.state
    return s && s.record ? this.fail(reason) : s
  }

  /** The take is downloaded: it joins the section's takes, selected and tagged NEW, on L. */
  downloaded(take: Take): LookbackView | null {
    const s = this.state
    if (!s || !s.record || s.record.phase !== "saving") return s
    const takes = s.takes.some((t) => t.name === take.name) ? s.takes : [...s.takes, take].sort((a, b) => a.number - b.number)
    this.sessionId = null
    this.state = { ...this.make(s.section, takes, takes.findIndex((t) => t.name === take.name), s.phoneConnected), newTake: take.name }
    return this.state
  }

  /** The take couldn't be downloaded. */
  downloadFailed(reason: string): LookbackView | null {
    const s = this.state
    return s && s.record && s.record.phase === "saving" ? this.fail(reason) : s
  }

  /** What the Lens asks of the server next, oldest first; each is handed over once. */
  takeRequests(): LookbackRequest[] {
    const out = this.requests
    this.requests = []
    return out
  }

  /**
   * The recorder status: whether the phone is connected, and our session's state. A phone that drops before the section
   * plays fails the recording; while saving, a ready session asks for its take to be downloaded.
   */
  recorderStatus(status: RecorderStatus): LookbackView | null {
    this.phoneStatus(status.phoneConnected)
    const s = this.state
    if (!s || !s.record) return s
    const phase = s.record.phase
    if ((phase === "arming" || phase === "countdown") && !status.phoneConnected) return this.fail(PHONE_DROPPED_MESSAGE)
    const mine = status.session && this.sessionId !== null && status.session.id === this.sessionId ? status.session : null
    if (!mine) return s
    if (mine.state === "failed" && (phase === "countdown" || phase === "recording" || phase === "saving")) return this.fail(mine.reason || SAVE_FAILED_MESSAGE)
    if (phase === "saving" && mine.state === "ready" && mine.take && !this.downloading) {
      this.downloading = true
      this.requests.push({ type: "download", take: mine.take })
    }
    return this.state
  }

  /** The recorder status says whether the phone is connected. */
  phoneStatus(connected: boolean): LookbackView | null {
    const s = this.state
    if (!s) return null
    if (s.phoneConnected !== connected) this.state = { ...s, phoneConnected: connected }
    return this.state
  }

  /**
   * One frame on, with the video's time in seconds (read only while recording). Returns true when a status poll is due;
   * never while outside Lookback.
   */
  tick(dtSec: number, videoTimeSec = 0): boolean {
    if (!this.state) return false
    this.tickMessage(dtSec)
    this.tickRecord(dtSec, videoTimeSec)
    this.sincePoll += dtSec
    if (this.sincePoll < STATUS_POLL_SEC) return false
    this.sincePoll = 0
    return true
  }

  private tickMessage(dtSec: number) {
    const s = this.state!
    if (s.message === null) return
    this.messageLeft -= dtSec
    if (this.messageLeft <= EPS) this.state = { ...s, message: null }
  }

  private tickRecord(dtSec: number, videoTimeSec: number) {
    const s = this.state!
    const r = s.record
    if (!r) return
    if (r.phase === "countdown") {
      this.elapsed += dtSec
      if (this.elapsed < COUNTDOWN_FROM) {
        const countdown = COUNTDOWN_FROM - Math.floor(this.elapsed)
        if (countdown !== r.countdown) this.state = { ...s, record: { ...r, countdown } }
        return
      }
      // The count has run out: the server hears the run started, and the section plays from this frame.
      this.requests.push({ type: "start", sessionId: this.sessionId! })
      this.state = { ...s, record: { ...r, phase: "recording", countdown: 0, progress: 0 } }
    } else if (r.phase === "recording") {
      const { start, end } = this.range
      if (videoTimeSec >= end - EPS) {
        this.requests.push({ type: "stop", sessionId: this.sessionId! })
        this.elapsed = 0
        this.downloading = false
        this.state = { ...s, record: { ...r, phase: "saving", progress: 1 } }
        return
      }
      const progress = end > start ? Math.min(Math.max((videoTimeSec - start) / (end - start), 0), 1) : 0
      this.state = { ...s, record: { ...r, progress } }
    } else if (r.phase === "saving") {
      this.elapsed += dtSec
      if (this.elapsed >= SAVE_TIMEOUT_SEC) this.fail(SAVE_TIMEOUT_MESSAGE)
    }
  }

  /** Back to I or L with a message. */
  private fail(message: string): LookbackView {
    this.messageLeft = MESSAGE_SEC
    this.requests = []
    this.sessionId = null
    this.state = { ...this.close(this.state!), message }
    return this.state
  }

  /** Back to I or L, with no recording. */
  private close(s: LookbackView): LookbackView {
    const next = { ...s, record: null }
    this.state = { ...next, screen: this.screenOf(next) }
    return this.state
  }

  private screenOf(s: { record: RecordView | null; takes: Take[] }): LookbackView["screen"] {
    if (s.record) return s.record.phase === "confirm" ? "J" : "K"
    return s.takes.length ? "L" : "I"
  }

  private reset() {
    this.requests = []
    this.sessionId = null
    this.elapsed = 0
    this.messageLeft = 0
    this.downloading = false
  }

  private make(section: number, takes: Take[], selected: number, phoneConnected: boolean): LookbackView {
    return {
      screen: takes.length ? "L" : "I",
      section,
      takes,
      selected: takes.length ? selected : -1,
      attempts: takes.slice(-ATTEMPTS_SHOWN),
      phoneConnected,
      record: null,
      newTake: null,
      message: null,
    }
  }
}
