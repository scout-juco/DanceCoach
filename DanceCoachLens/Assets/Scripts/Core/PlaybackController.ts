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
 *
 * M1-05: the first look. The first time a dance opens, the whole routine plays once at 1×,
 * whatever the saved speed, with the controls locked; "Skip to Section 1" cuts it short.
 * Either way it goes on to Section 1's count-in. Once seen, later opens go straight there.
 *
 * M1-06: finishing the routine. Finish routine stays greyed until a run that includes the last
 * section ends (a section run, From the top or Full; not the first look), then stays unlocked
 * for the dance, and Clip ended becomes C2. No pop-up when the last section ends. Finish
 * routine opens the Routine done pop-up (G) over the dimmed video.
 *
 * Milestone 3 / M3-01: the mode lives here. On Clip ended the mode button enters Pose (screen D)
 * on the current section, with the video paused on its start; PoseController runs Pose from
 * there. In Pose the mode button says Lookback is coming and comes back to Clip ended for
 * that section. Playthrough's commands are ignored while in Pose.
 *
 * M3-07: Play from here leaves Pose for Playthrough and runs the section from the frozen count to its end,
 * counting in with a 5, 6, 7, 8 over the 4 counts before that count (dimmed), or the frozen still without footage that early.
 * The mirror setting is shared between the two modes.
 */
import { CountClock, LEAD_IN_COUNTS } from "./CountClock"
import { DancePackage } from "./DancePackage"

/** Screen IDs from the clickable prototype. */
export type ScreenId = "PV" | "BI" | "B0" | "B" | "F" | "C" | "C2" | "G" | "D" | "E"

export type RunKind = "section" | "top" | "full"

export type Speed = 0.5 | 0.75 | 1

export type CountInKind = "startingPose" | "leadIn"

/** What a section tile runs: a section, or the whole routine. */
export type SectionTap = number | "full"

/** The practice modes, in the order the mode button cycles through them. Lookback doesn't exist yet. */
export const MODES = ["Playthrough", "Pose", "Lookback"] as const

export type Mode = (typeof MODES)[number]

export const LOOKBACK_TOAST = "Lookback is coming soon"

export const NO_STILLS_TOAST = "This dance has no poses yet: re-save it on the adjust page"

export const finishLockedToast = (lastSection: number) => `Finish routine unlocks after you finish Section ${lastSection}`

/** The pop-ups, which open in front of the dancer rather than on the video board. */
export type Popup = "routineDone"

/** The Routine done choices: Run it again (from the top), Keep practicing, Back. */
export type RoutineDoneChoice = "again" | "practice" | "back"

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
  /** Pose steps by half-counts (on the "&"s too) instead of whole counts. */
  halfCounts: boolean
}

export interface Progress {
  firstLookSeen: boolean
  doneSections: number[]
  /** Finish routine has unlocked for this dance. */
  finishReady: boolean
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = { speed: 1, mirror: false, counts: true, halfCounts: false }

export interface VideoRequest {
  /** Video time to seek to. Apply it only when seekId changes. */
  seekTo: number
  seekId: number
  /** Video time where the run ends. A run that outlasts its clip carries on into the next section's clip. */
  runEnd: number
  playing: boolean
  rate: number
  /** Hold the last frame (the clip has played out before the run ended). */
  holdFrame: boolean
  dim: boolean
}

export interface ViewState {
  screen: ScreenId
  /** The first look has played (or been skipped) for this dance; the Lens saves it. */
  firstLookSeen: boolean
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
  /** Finish routine is unlocked: a run that includes the last section has ended. The Lens saves it. */
  finishReady: boolean
  settings: Settings
  mode: Mode
  /** A short message over the controls, or null. */
  toast: string | null
  /** The pop-up showing, or null. The board's controls are locked behind it. */
  popup: Popup | null
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
  // Where the current run starts playing when that isn't its section's start (Play from here); null otherwise.
  private fromTime: number | null = null

  /** hasStills is false for a dance with no stills (made Ready before M3): Pose can't open on it. */
  constructor(readonly pkg: DancePackage, progress?: Partial<Progress>, private readonly hasStills = true) {
    this.clock = new CountClock(pkg)
    const settings = { ...DEFAULT_SETTINGS, ...(progress && progress.settings) }
    this.state = {
      screen: "C",
      firstLookSeen: !!(progress && progress.firstLookSeen),
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
      finishReady: !!(progress && progress.finishReady),
      settings,
      mode: "Playthrough",
      toast: null,
      popup: null,
      video: { seekTo: this.clock.sectionStart(1), seekId: 0, runEnd: this.clock.sectionEnd(1), playing: false, rate: settings.speed, holdFrame: false, dim: false },
    }
  }

  get view(): ViewState {
    return this.state
  }

  /**
   * Opens the dance: the first look the first time, otherwise straight into Section 1's count-in.
   * The first look plays from where the top clip starts (Section 1's lead-in, when there's footage
   * for it) through the end of the routine, at 1×, with no count-in.
   */
  open(): ViewState {
    if (this.state.firstLookSeen) return this.tapSection(1)
    const s = this.state
    const lead = this.clock.leadIn(1)
    this.state = {
      ...s,
      screen: "PV",
      runKind: "full",
      section: 1,
      runSection: 1,
      runStop: this.clock.sectionCount,
      sectionProgress: 0,
      count: 0,
      and: false,
      countIn: null,
      runProgress: 0,
      controlsLocked: true,
      video: {
        ...s.video,
        seekTo: lead ? lead.start : this.clock.sectionStart(1),
        seekId: s.video.seekId + 1,
        runEnd: this.clock.sectionEnd(this.clock.sectionCount),
        playing: true,
        rate: 1,
        holdFrame: false,
        dim: false,
      },
    }
    return this.state
  }

  /** "Skip to Section 1": ends the first look now. Ignored outside the first look. */
  skipFirstLook(): ViewState {
    return this.state.screen === "PV" ? this.endFirstLook() : this.state
  }

  /** The first look is over (played or skipped): it's seen, and Section 1 counts in. */
  private endFirstLook(): ViewState {
    this.state = { ...this.state, firstLookSeen: true, controlsLocked: false, video: { ...this.state.video, playing: false } }
    return this.tapSection(1)
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
   * Plays a contiguous range of sections, first through last, as one run with the count-in
   * of the first. A range of one is the same as tapping that section. Ignored while the controls are locked.
   */
  tapRange(first: number, last: number): ViewState {
    const lo = Math.max(1, Math.min(first, last))
    const hi = Math.min(this.clock.sectionCount, Math.max(first, last))
    return this.startRun("section", lo, hi)
  }

  /**
   * Runs from the start of Section 1 through the end of the current section (the whole
   * routine after Full), counting in as Section 1 does. Ignored while the controls are locked.
   * After a range it stops at the end of the range.
   */
  fromTheTop(): ViewState {
    const s = this.state
    return this.startRun("top", s.section, s.runKind === "full" ? this.clock.sectionCount : s.runStop)
  }

  /** Runs the current section, range (or Full) again, with its count-in. Ignored while the controls are locked. */
  replay(): ViewState {
    const s = this.state
    if (s.runKind === "full") return this.tapSection("full")
    return this.tapRange(s.section, s.runKind === "section" ? s.runStop : s.section)
  }

  /**
   * Pose's Play from here: runs section n from the frozen step (0 to 15, a half-count each) to the section's end,
   * in Playthrough, at the current speed, controls locked, ending on Clip ended. Ignored outside Pose.
   */
  playFromHere(section: number, step: number): ViewState {
    const s = this.state
    if (s.mode !== "Pose" || s.controlsLocked) return s
    this.state = { ...s, mode: "Playthrough", toast: null }
    return this.startRun("section", section, section, this.clock.sectionStart(section) + (step * this.clock.beatSec) / 2)
  }

  /** The 4 counts before a run's first count: before the frozen count of Play from here, else before its first section. */
  private leadWindow(first: number): { start: number; end: number } | null {
    if (this.fromTime === null) return this.clock.leadIn(first)
    const start = this.fromTime - LEAD_IN_COUNTS * this.clock.beatSec
    return start < -EPS ? null : { start: Math.max(start, 0), end: this.fromTime }
  }

  private startRun(kind: RunKind, section: number, stop: number, from: number | null = null): ViewState {
    const s = this.state
    if (!this.canPlay()) return s
    this.fromTime = from
    const first = kind === "section" ? section : 1
    const lead = this.leadWindow(first)
    const start = from ?? this.clock.sectionStart(first)
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
        runEnd: this.clock.sectionEnd(stop),
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
    if (!this.canPlay()) return s
    this.state = { ...s, settings: { ...s.settings, speed }, video: { ...s.video, rate: speed } }
    return this.state
  }

  toggleMirror(): ViewState {
    return this.changeSettings((st) => ({ ...st, mirror: !st.mirror }))
  }

  toggleCounts(): ViewState {
    return this.changeSettings((st) => ({ ...st, counts: !st.counts }))
  }

  /** Pose's Half counts toggle; it's saved with the other settings. */
  toggleHalfCounts(): ViewState {
    return this.changeSettings((st) => ({ ...st, halfCounts: !st.halfCounts }))
  }

  /**
   * The mode button. On Clip ended it enters Pose on the current section, the video paused on its
   * start. In Pose, Lookback doesn't exist yet, so it says so and comes back to Clip ended for that
   * section, ready to replay it; or, if stepping carried Pose into another section, for that one (poseSection).
   * Ignored while the controls are locked.
   */
  tapMode(poseSection?: number): ViewState {
    const s = this.state
    if (s.controlsLocked) return s
    if (s.mode === "Playthrough") {
      if (!this.hasStills) {
        this.toastLeft = TOAST_SEC
        this.state = { ...s, toast: NO_STILLS_TOAST }
        return this.state
      }
      const start = this.clock.sectionStart(s.section)
      this.state = {
        ...s,
        mode: "Pose",
        screen: "D",
        count: 0,
        and: false,
        toast: null,
        video: { ...s.video, seekTo: start, seekId: s.video.seekId + 1, runEnd: this.clock.sectionEnd(s.section), playing: false, holdFrame: false, dim: false },
      }
      return this.state
    }
    this.toastLeft = TOAST_SEC
    const n = poseSection ?? s.section
    this.state = {
      ...s,
      section: n,
      mode: "Playthrough",
      screen: s.finishReady ? "C2" : "C",
      runKind: "section",
      runSection: n,
      runStop: n,
      count: this.lastCount(n),
      sectionProgress: 1,
      runProgress: 1,
      toast: LOOKBACK_TOAST,
    }
    return this.state
  }

  /** Runs, speed and Finish routine work only on Playthrough's unlocked screens. */
  private canPlay(): boolean {
    return !this.state.controlsLocked && this.state.mode === "Playthrough"
  }

  /** The last count of section n: 8, or less for a partial last section that ends with the footage. */
  private lastCount(n: number): number {
    return this.clock.countIn(n, this.clock.sectionEnd(n) - 1e-3).count
  }

  /**
   * Finish routine: opens Routine done once it's unlocked; until then a toast says when it will.
   * Ignored while the controls are locked.
   */
  finish(): ViewState {
    const s = this.state
    if (!this.canPlay()) return s
    if (!s.finishReady) {
      this.toastLeft = TOAST_SEC
      this.state = { ...s, toast: finishLockedToast(this.clock.sectionCount) }
      return this.state
    }
    this.state = { ...s, screen: "G", popup: "routineDone", controlsLocked: true, toast: null, video: { ...s.video, playing: false, dim: true } }
    return this.state
  }

  /**
   * A Routine done choice. Run it again plays From the top over the whole routine; Keep practicing
   * and Back close the pop-up onto Clip ended. Ignored without the pop-up.
   */
  routineDone(choice: RoutineDoneChoice): ViewState {
    const s = this.state
    if (s.popup !== "routineDone") return s
    this.state = { ...s, screen: "C2", popup: null, controlsLocked: false, video: { ...s.video, dim: false } }
    if (choice !== "again") return this.state
    const last = this.clock.sectionCount
    return this.startRun("top", last, last)
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
      case "PV":
        return this.tickFirstLook(videoTimeSec)
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

  private tickFirstLook(t: number): ViewState {
    if (t >= this.clock.sectionEnd(this.state.runStop) - EPS) return this.endFirstLook()
    // Before Section 1 (its lead-in) there's no count yet.
    if (t < this.clock.sectionStart(1) - EPS) return this.state
    return this.tickRun(t)
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
    const lead = this.leadWindow(s.runSection)!
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
      ...(this.fromTime === null ? { count: 1, and: false } : this.clock.countIn(s.runSection, this.fromTime)),
      countIn: null,
      video: { ...s.video, playing: true, dim: false },
    }
    return this.state
  }

  private tickRun(t: number): ViewState {
    const s = this.state
    const first = s.runKind === "section" ? s.section : 1
    const start = this.fromTime ?? this.clock.sectionStart(first)
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
    // Only a section run ticks its sections (all of a range); From the top and Full chain sections already learned.
    let done = s.doneSections
    if (s.runKind === "section") {
      for (let n = s.section; n <= s.runStop; n++) if (done.indexOf(n) < 0) done = done.concat(n)
      done = done === s.doneSections ? done : done.slice().sort((a, b) => a - b)
    }
    // Any run that reaches the last section unlocks Finish routine, quietly: no pop-up.
    const finishReady = s.finishReady || s.runStop === this.clock.sectionCount
    this.state = {
      ...s,
      screen: finishReady ? "C2" : "C",
      // The last count reached.
      count: this.lastCount(s.runStop),
      and: false,
      countIn: null,
      runSection: s.runStop,
      sectionProgress: 1,
      runProgress: 1,
      controlsLocked: false,
      doneSections: done,
      finishReady,
      video: { ...s.video, playing: false, dim: false },
    }
    return this.state
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
