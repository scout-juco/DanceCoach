/**
 * PlaybackController: the Playthrough state machine, and the test seam.
 *
 * It knows nothing about the engine. The Lens feeds it the video time each frame
 * with tick(), sends it commands, and renders the ViewState it returns. The view
 * carries out the video requests in that state (seek, play/pause, rate).
 *
 * Milestone 1 / M1-02: section runs. Tapping a section starts a 5, 6, 7, 8 count-in
 * over a dimmed lead-in (the 4 counts before it, which for Section 1 is footage from
 * before the trim), then plays the section with the controls locked and stops on Clip
 * ended. Without 4 counts of footage before Section 1, it freezes on a starting pose instead.
 *
 * M1-03: the control bar on Clip ended. Replay section, speed, mirror and counts; the
 * settings carry into every run. The mode button stays in Playthrough and shows a toast.
 *
 * M1-04: the chaining runs. From the top plays Section 1 through the end of the current
 * section; Full plays the whole routine. Both count in the way Section 1 does (its lead-in,
 * or the starting pose without one), play at the current speed with the controls locked,
 * and stop on Clip ended.
 */
import { CountClock, LEAD_IN_COUNTS } from "./CountClock"
import { DancePackage } from "./DancePackage"

/** Screen IDs from the clickable prototype. */
export type ScreenId = "PV" | "BI" | "B0" | "B" | "F" | "C" | "C2" | "G"

export type RunKind = "section" | "top" | "full"

export type Speed = 0.5 | 0.75 | 1

export type CountInKind = "startingPose" | "leadIn"

/** What a section tile runs: a section, or the whole routine. */
export type SectionTap = number | "full"

/** The practice modes, in the order the mode button cycles through them. Only Playthrough exists yet. */
export const MODES = ["Playthrough", "Pose", "Lookback"] as const

export type Mode = (typeof MODES)[number]

export const COMING_SOON_TOAST = "Pose and Lookback are coming soon"

/** How long a toast stays up, in seconds. */
export const TOAST_SEC = 2.6

export interface CountIn {
  /** 5–8. */
  number: number
  kind: CountInKind
}

export interface Settings {
  speed: Speed
  mirror: boolean
  counts: boolean
}

export interface Progress {
  firstLookSeen: boolean
  doneSections: number[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = { speed: 1, mirror: false, counts: true }

export interface VideoRequest {
  /** Video time to seek to. Apply it only when seekId changes. */
  seekTo: number
  seekId: number
  playing: boolean
  rate: number
  /** Hold the last frame (the clip has played out before the run ended). */
  holdFrame: boolean
  dim: boolean
}

export interface ViewState {
  screen: ScreenId
  runKind: RunKind
  /** The current section: the one a section run plays, or where From the top stops. */
  section: number
  /** The section playing now. A section run plays only its section; From the top and Full play several. */
  runSection: number
  /** The last section the run plays. */
  runStop: number
  /** 0–1 through runSection. */
  sectionProgress: number
  sectionCount: number
  /** 1–8, or 0 when there's no count to show. */
  count: number
  and: boolean
  /** The 5, 6, 7, 8 before a run, or null once the run is playing. */
  countIn: CountIn | null
  /** 0–1 through the current run. */
  runProgress: number
  /** Where the section starts on 1 along the count-in's progress bar (0 for a starting pose). */
  leadInFraction: number
  controlsLocked: boolean
  doneSections: number[]
  settings: Settings
  mode: Mode
  /** A short message over the controls, or null. */
  toast: string | null
  video: VideoRequest
}

// Absorbs float error so a time exactly on a beat lands on that beat.
const EPS = 1e-6

export class PlaybackController {
  readonly clock: CountClock
  private state: ViewState
  // Video seconds counted through a frozen starting pose (the video isn't moving, so tick's dt drives it).
  private poseElapsed = 0
  private toastLeft = 0

  constructor(readonly pkg: DancePackage, progress?: Partial<Progress>) {
    this.clock = new CountClock(pkg)
    const settings = { ...DEFAULT_SETTINGS, ...(progress && progress.settings) }
    this.state = {
      screen: "C",
      runKind: "section",
      section: 1,
      runSection: 1,
      runStop: 1,
      sectionProgress: 0,
      sectionCount: this.clock.sectionCount,
      count: 0,
      and: false,
      countIn: null,
      runProgress: 0,
      leadInFraction: 0,
      controlsLocked: false,
      doneSections: progress && progress.doneSections ? progress.doneSections.slice() : [],
      settings,
      mode: "Playthrough",
      toast: null,
      video: { seekTo: this.clock.sectionStart(1), seekId: 0, playing: false, rate: settings.speed, holdFrame: false, dim: false },
    }
  }

  get view(): ViewState {
    return this.state
  }

  /**
   * Starts a run of section n with its count-in: the 4 counts before it play dimmed, or,
   * when the video has no footage that early, the first frame freezes (starting pose).
   * "full" runs the whole routine, counting in as Section 1 does. Ignored while the controls are locked.
   */
  tapSection(n: SectionTap): ViewState {
    if (n === "full") return this.startRun("full", this.state.section, this.clock.sectionCount)
    return this.startRun("section", n, n)
  }

  /**
   * Runs from the start of Section 1 through the end of the current section (the whole
   * routine after Full), counting in as Section 1 does. Ignored while the controls are locked.
   */
  fromTheTop(): ViewState {
    const s = this.state
    return this.startRun("top", s.section, s.runKind === "full" ? this.clock.sectionCount : s.section)
  }

  /** Runs the current section (or Full) again, with its count-in. Ignored while the controls are locked. */
  replay(): ViewState {
    return this.tapSection(this.state.runKind === "full" ? "full" : this.state.section)
  }

  private startRun(kind: RunKind, section: number, stop: number): ViewState {
    const s = this.state
    if (s.controlsLocked) return s
    const first = kind === "section" ? section : 1
    const lead = this.clock.leadIn(first)
    const start = this.clock.sectionStart(first)
    this.poseElapsed = 0
    this.state = {
      ...s,
      screen: lead ? "B0" : "BI",
      runKind: kind,
      section,
      runSection: first,
      runStop: stop,
      sectionProgress: 0,
      count: 0,
      and: false,
      countIn: { number: 5, kind: lead ? "leadIn" : "startingPose" },
      runProgress: 0,
      leadInFraction: lead ? (start - lead.start) / (this.clock.sectionEnd(first) - lead.start) : 0,
      controlsLocked: true,
      video: {
        ...s.video,
        seekTo: lead ? lead.start : start,
        seekId: s.video.seekId + 1,
        playing: !!lead,
        rate: s.settings.speed,
        holdFrame: false,
        dim: !!lead,
      },
    }
    return this.state
  }

  /** Sets the speed for every run from the next one on. Ignored while the controls are locked. */
  setSpeed(speed: Speed): ViewState {
    const s = this.state
    if (s.controlsLocked) return s
    this.state = { ...s, settings: { ...s.settings, speed }, video: { ...s.video, rate: speed } }
    return this.state
  }

  toggleMirror(): ViewState {
    return this.changeSettings((st) => ({ ...st, mirror: !st.mirror }))
  }

  toggleCounts(): ViewState {
    return this.changeSettings((st) => ({ ...st, counts: !st.counts }))
  }

  /** The mode button: Pose and Lookback don't exist yet, so it says so and stays in Playthrough. */
  tapMode(): ViewState {
    const s = this.state
    if (s.controlsLocked) return s
    this.toastLeft = TOAST_SEC
    this.state = { ...s, toast: COMING_SOON_TOAST }
    return this.state
  }

  private changeSettings(change: (settings: Settings) => Settings): ViewState {
    const s = this.state
    if (s.controlsLocked) return s
    this.state = { ...s, settings: change(s.settings) }
    return this.state
  }

  /**
   * Advances to the given video time. dtSec is the real time since the last tick; it only
   * matters while the video is frozen (the starting pose). Returns the new view state.
   */
  tick(videoTimeSec: number, dtSec = 0): ViewState {
    if (this.state.toast !== null) {
      this.toastLeft -= dtSec
      if (this.toastLeft <= EPS) this.state = { ...this.state, toast: null }
    }
    switch (this.state.screen) {
      case "BI":
        return this.tickStartingPose(dtSec)
      case "B0":
        return this.tickLeadIn(videoTimeSec)
      case "B":
      case "F":
        return this.tickRun(videoTimeSec)
      default:
        return this.state
    }
  }

  private tickStartingPose(dtSec: number): ViewState {
    const s = this.state
    this.poseElapsed += dtSec * s.settings.speed
    const beats = Math.floor(this.poseElapsed / this.clock.beatSec + EPS)
    if (beats >= LEAD_IN_COUNTS) return this.startPlaying()
    this.state = { ...s, countIn: { number: 5 + beats, kind: "startingPose" } }
    return this.state
  }

  private tickLeadIn(t: number): ViewState {
    const s = this.state
    const lead = this.clock.leadIn(s.runSection)!
    if (t >= lead.end - EPS) {
      this.startPlaying()
      return this.tickRun(t)
    }
    const beats = Math.floor((t - lead.start) / this.clock.beatSec + EPS)
    const number = 5 + Math.min(Math.max(beats, 0), LEAD_IN_COUNTS - 1)
    this.state = { ...s, countIn: { number, kind: "leadIn" } }
    return this.state
  }

  /** The count-in is over: the section plays from count 1, carrying on from where the video is. */
  private startPlaying(): ViewState {
    const s = this.state
    this.state = {
      ...s,
      screen: s.runKind === "top" ? "F" : "B",
      count: 1,
      and: false,
      countIn: null,
      video: { ...s.video, playing: true, dim: false },
    }
    return this.state
  }

  private tickRun(t: number): ViewState {
    const s = this.state
    const first = s.runKind === "section" ? s.section : 1
    const start = this.clock.sectionStart(first)
    const end = this.clock.sectionEnd(s.runStop)
    if (t >= end - EPS) return this.endRun()
    const n = Math.min(Math.max(this.clock.sectionAt(t), first), s.runStop)
    const { count, and } = this.clock.countIn(n, t)
    const nStart = this.clock.sectionStart(n)
    this.state = {
      ...s,
      count,
      and,
      runSection: n,
      sectionProgress: clamp01((t - nStart) / (this.clock.sectionEnd(n) - nStart)),
      runProgress: clamp01((t - start) / (end - start)),
    }
    return this.state
  }

  private endRun(): ViewState {
    const s = this.state
    // Only a section run ticks its section; From the top and Full chain sections already learned.
    const done = s.runKind !== "section" || s.doneSections.indexOf(s.section) >= 0 ? s.doneSections : s.doneSections.concat(s.section).sort((a, b) => a - b)
    this.state = {
      ...s,
      screen: "C",
      // The last count reached: 8, or less for a partial last section that ends with the footage.
      count: this.clock.countIn(s.runStop, this.clock.sectionEnd(s.runStop) - 1e-3).count,
      and: false,
      countIn: null,
      runSection: s.runStop,
      sectionProgress: 1,
      runProgress: 1,
      controlsLocked: false,
      doneSections: done,
      video: { ...s.video, playing: false, dim: false },
    }
    return this.state
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
