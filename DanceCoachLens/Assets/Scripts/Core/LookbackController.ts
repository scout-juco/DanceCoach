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
 *
 * M4-07: side by side (screen M). Play side by side on L asks for the selected take's video (a "load" request), then
 * opens M on count 1, paused. Both play at M's speed button (0.5×, 0.75× or 1× of the dance's real tempo, opening at the
 * take's own speed): the original at that rate and the take sped up by the speed it was filmed at. Each clip gets a request (originalClip, takeClip) the Lens hands its player:
 * the player can't seek, so a seek restarts the clip, and the clips play only once the Lens says both have landed (landed).
 * Scrubbing snaps to a count and seeks on release, since a seek is too slow to follow a drag.
 *
 * M4-08: edge cases. A phone that is gone when the section ends fails the take ("The phone stopped filming. Record again?");
 * a server that can't be reached fails a take that hasn't started playing and otherwise leaves a message on I or L; a short
 * last section has fewer than 8 counts, so side by side's scrub bar has that many stops.
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
/** Also the reason the server gives a take whose phone went away. */
export const PHONE_STOPPED_MESSAGE = "The phone stopped filming. Record again?"
export const UNREACHABLE_MESSAGE = "Can't reach the dance server: check it is running and on the same Wi-Fi"

// Absorbs float error so a time exactly on the section's end ends it.
const EPS = 1e-6

/** Where a recording has got to: J's question, then K's phases. */
export type RecordPhase = "confirm" | "arming" | "countdown" | "recording" | "saving"

/** What the Lens should ask of the server. */
export type LookbackRequest =
  | { type: "arm"; params: TakeParams }
  /** The section starts playing; videoTimeSec is where in the original video it plays from. */
  | { type: "start"; sessionId: string; videoTimeSec: number }
  | { type: "stop"; sessionId: string }
  /** The take is ready on the server: download it, then call downloaded (or downloadFailed). */
  | { type: "download"; take: Take }
  /** Side by side needs the take's video: have it loaded (or reuse it), then call takeLoaded (or takeLoadFailed). */
  | { type: "load"; take: Take }

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

/** The speeds side by side's speed button cycles through, as a share of the dance's real tempo. */
export const SBS_SPEEDS = [0.5, 0.75, 1]

/** Where the section sits in the original video: seconds, and the length of a count. */
export interface SideBySideSetup {
  start: number
  end: number
  beatSec: number
}

/** What one of the two videos should do. Seek only when seekId changes, as with VideoRequest. */
export interface ClipRequest {
  /** Seconds into the clip: the original's time in its own video, or the take's time from its count 1. */
  seekTo: number
  seekId: number
  playing: boolean
  rate: number
}

/** Side by side (M). */
export interface SideBySideView {
  take: Take
  /** 1–8: the count on show. */
  count: number
  /** 0–1 through the section, for the scrub bar's marker. */
  fraction: number
  /** Play was pressed and the section hasn't ended: the clips run once they've landed. */
  playing: boolean
  /** A seek is under way: the Lens calls landed() when both clips are on their frame. */
  seeking: boolean
  /** The tempo both play at, as a share of the dance's real tempo: a take filmed at 0.75× opens at 0.75×. */
  speed: number
  /** How many counts the section has, 1–8: fewer in a short last section. */
  counts: number
  originalClip: ClipRequest
  takeClip: ClipRequest
}

/** What the Lens shows in Lookback. */
export interface LookbackView {
  /** I: no takes for the section. L: takes, one selected. J: "Record lookback?" over either. K: recording. M: side by side. */
  screen: "I" | "L" | "J" | "K" | "M"
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
  /** Side by side (M), or null. */
  sideBySide: SideBySideView | null
}

/** The left video's heading on M. */
export const originalHead = (mirror: boolean) => `ORIGINAL${mirror ? " · MIRRORED" : ""}`

/** The right video's heading on M. */
export const TAKE_HEAD = "YOU · LOOKBACK FROM PHONE"

/** How many counts a section from `start` to `end` seconds has: 8, or fewer for a short last section. */
export function sectionCounts(start: number, end: number, beatSec: number): number {
  if (!(beatSec > 0)) return 8
  return Math.min(Math.max(Math.ceil((end - start) / beatSec - 1e-3), 1), 8)
}

/** The count at `fraction` (0–1) along M's scrub bar: the bar has equal stops, one per count (8, or fewer in a short section). */
export function scrubCount(fraction: number, counts = 8): number {
  const f = Math.min(Math.max(fraction, 0), 1)
  return Math.min(Math.floor(f * counts), counts - 1) + 1
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
  // Side by side: where the section sits in the original, the take being loaded for it, and the seek counter
  // (never reset, so a player that has seen an id never sees it again).
  private setup: SideBySideSetup = { start: 0, end: 0, beatSec: 0.5 }
  private loadingTake: Take | null = null
  private seekId = 0
  private seekCount = 1

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
    const next = { ...this.make(s.section, takes, keep >= 0 ? keep : takes.length - 1, s.phoneConnected), record: s.record, newTake: s.newTake, message: s.message, sideBySide: s.sideBySide }
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
    this.loadingTake = null
    this.state = { ...s, screen: "J", record: { phase: "confirm", speed, mirror, countdown: COUNTDOWN_FROM, progress: 0 }, newTake: null, message: null, sideBySide: null }
    return this.state
  }

  /** Record again, on M: the same question as the + (J), over L. */
  recordAgain(speed: number, mirror: boolean, range: SectionRange): LookbackView | null {
    return this.tapRecord(speed, mirror, range)
  }

  /** Play side by side, on L: asks the Lens for the selected take's video, then opens M. */
  playSideBySide(setup: SideBySideSetup): LookbackView | null {
    const s = this.state
    if (!s || s.record || s.screen !== "L" || s.selected < 0 || this.loadingTake) return s
    this.setup = setup
    this.loadingTake = s.takes[s.selected]
    this.requests.push({ type: "load", take: this.loadingTake })
    return s
  }

  /** The take's video is ready: M opens on count 1, paused. */
  takeLoaded(take: Take): LookbackView | null {
    const s = this.state
    if (!s || !this.loadingTake || this.loadingTake.name !== take.name) return s
    this.loadingTake = null
    this.state = { ...s, screen: "M", message: null, sideBySide: this.seekView(take, 1, take.speed, false) }
    return this.state
  }

  /** The take's video couldn't be loaded: back on L with a message. */
  takeLoadFailed(reason: string): LookbackView | null {
    const s = this.state
    if (!s || !this.loadingTake) return s
    this.loadingTake = null
    this.messageLeft = MESSAGE_SEC
    this.state = { ...s, message: reason }
    return this.state
  }

  /** Back to takes: L, with the take still selected. */
  backToTakes(): LookbackView | null {
    const s = this.state
    if (!s || !s.sideBySide) return s
    this.state = { ...s, screen: "L", sideBySide: null }
    return this.state
  }

  /** Play or pause both. At the end of the section, play starts again from count 1. */
  togglePlay(): LookbackView | null {
    const v = this.sbs()
    if (!v) return this.state
    if (v.playing) return this.setSbs(this.sbsView(v, { playing: false }))
    if (!v.seeking && v.fraction >= 1 - EPS) return this.setSbs(this.seekView(v.take, 1, v.speed, true))
    return this.setSbs(this.sbsView(v, { playing: true }))
  }

  /** The scrub bar is being dragged, `fraction` (0–1) along it: both pause and the count snaps; the seek waits for scrubEnd. */
  scrub(fraction: number): LookbackView | null {
    const v = this.sbs()
    if (!v) return this.state
    const count = scrubCount(fraction, v.counts)
    return this.setSbs(this.sbsView(v, { playing: false, count, fraction: (count - 1) / v.counts }))
  }

  /** The drag was let go: both videos seek to the count it snapped to, and stay paused there. */
  scrubEnd(): LookbackView | null {
    const v = this.sbs()
    return v ? this.setSbs(this.seekView(v.take, v.count, v.speed, false)) : this.state
  }

  /** The speed button: up through 0.5×, 0.75× and 1× of the real tempo, then back to 0.5×. The take is sped up to match when it was filmed slower. A player only takes a rate when it starts, so both restart on the count they're on. */
  cycleSpeed(): LookbackView | null {
    const v = this.sbs()
    if (!v) return this.state
    const speed = SBS_SPEEDS.find(x => x > v.speed + EPS) ?? SBS_SPEEDS[0]
    return this.setSbs(this.seekView(v.take, v.count, speed, v.playing))
  }

  /** Both videos are on the frame they were sent to: the clips may play. */
  landed(): LookbackView | null {
    const v = this.sbs()
    return v && v.seeking ? this.setSbs(this.sbsView(v, { seeking: false })) : this.state
  }

  private sbs(): SideBySideView | null {
    const s = this.state
    return s && s.screen === "M" ? s.sideBySide : null
  }

  private setSbs(v: SideBySideView): LookbackView {
    this.state = { ...this.state!, sideBySide: v }
    return this.state
  }

  /** A side-by-side view whose clips are sent to `count`'s frame, held until they've landed. */
  private seekView(take: Take, count: number, speed: number, playing: boolean): SideBySideView {
    this.seekId++
    this.seekCount = count
    const counts = sectionCounts(this.setup.start, this.setup.end, this.setup.beatSec)
    return this.sbsView({ take, speed } as SideBySideView, { count, counts, fraction: (count - 1) / counts, playing, seeking: true })
  }

  /** `v` with changes, and the clip requests that go with them. */
  private sbsView(v: SideBySideView, change: Partial<SideBySideView>): SideBySideView {
    const next = { ...v, ...change }
    const { start, beatSec } = this.setup
    const u = (this.seekCount - 1) * beatSec
    const running = next.playing && !next.seeking
    return {
      ...next,
      originalClip: { seekTo: start + u, seekId: this.seekId, playing: running, rate: next.speed },
      takeClip: { seekTo: u / next.take.speed, seekId: this.seekId, playing: running, rate: next.speed / next.take.speed },
    }
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
    // The section has played, but the phone is gone and hasn't got the recording to the server: it never will.
    if (phase === "saving" && !status.phoneConnected && !(mine && (mine.state === "processing" || mine.state === "ready"))) return this.fail(PHONE_STOPPED_MESSAGE)
    if (!mine) return s
    if (mine.state === "failed" && (phase === "countdown" || phase === "recording" || phase === "saving")) return this.fail(mine.reason || SAVE_FAILED_MESSAGE)
    if (phase === "saving" && mine.state === "ready" && mine.take && !this.downloading) {
      this.downloading = true
      this.requests.push({ type: "download", take: mine.take })
    }
    return this.state
  }

  /**
   * The server couldn't be reached (a status poll or the listing failed). A take that hasn't started playing fails; one
   * that has plays on, since the section can't be stopped and the take may yet arrive. Otherwise a message shows on I or L.
   */
  serverUnreachable(): LookbackView | null {
    const s = this.state
    if (!s) return null
    this.phoneStatus(false)
    const phase = this.state!.record ? this.state!.record!.phase : null
    if (phase === "arming" || phase === "countdown") return this.fail(UNREACHABLE_MESSAGE)
    if (phase === null) {
      this.messageLeft = MESSAGE_SEC
      this.state = { ...this.state!, message: UNREACHABLE_MESSAGE }
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
    this.tickSideBySide(videoTimeSec)
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

  /** While both play, the count follows the original's time; at the section's end both stop on its last count. */
  private tickSideBySide(videoTimeSec: number) {
    const v = this.sbs()
    if (!v || !v.playing || v.seeking) return
    const { start, end, beatSec } = this.setup
    const len = end - start
    const countAt = (u: number) => Math.min(Math.max(Math.floor(u / beatSec + EPS), 0), v.counts - 1) + 1
    if (videoTimeSec >= end - EPS) {
      this.setSbs(this.sbsView(v, { playing: false, count: countAt(len - 1e-3), fraction: 1 }))
      return
    }
    const u = videoTimeSec - start
    this.setSbs(this.sbsView(v, { count: countAt(u), fraction: len > 0 ? Math.min(Math.max(u / len, 0), 1) : 0 }))
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
      this.requests.push({ type: "start", sessionId: this.sessionId!, videoTimeSec })
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

  private screenOf(s: { record: RecordView | null; sideBySide: SideBySideView | null; takes: Take[] }): LookbackView["screen"] {
    if (s.record) return s.record.phase === "confirm" ? "J" : "K"
    if (s.sideBySide) return "M"
    return s.takes.length ? "L" : "I"
  }

  private reset() {
    this.requests = []
    this.sessionId = null
    this.elapsed = 0
    this.messageLeft = 0
    this.downloading = false
    this.loadingTake = null
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
      sideBySide: null,
    }
  }
}
