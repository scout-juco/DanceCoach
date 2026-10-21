/**
 * PlaybackController: the Playthrough state machine, and the test seam.
 *
 * It knows nothing about the engine. The Lens feeds it the video time each frame
 * with tick(), sends it commands, and renders the ViewState it returns. The view
 * carries out the video requests in that state (seek, play/pause, rate).
 *
 * Milestone 1 / M1-01: only "play Section 1, stop at its end" is handled.
 */
import { CountClock } from "./CountClock"
import { DancePackage } from "./DancePackage"

/** Screen IDs from the clickable prototype. */
export type ScreenId = "PV" | "BI" | "B0" | "B" | "F" | "C" | "C2" | "G"

export type RunKind = "section" | "top" | "full"

export type Speed = 0.5 | 0.75 | 1

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
  /** Hold the last frame (the run has gone past the end of the footage). */
  holdFrame: boolean
  dim: boolean
}

export interface ViewState {
  screen: ScreenId
  runKind: RunKind
  section: number
  sectionCount: number
  /** 1–8, or 0 when there's no count to show. */
  count: number
  and: boolean
  /** 0–1 through the current run. */
  runProgress: number
  controlsLocked: boolean
  doneSections: number[]
  settings: Settings
  video: VideoRequest
}

export class PlaybackController {
  readonly clock: CountClock
  private state: ViewState

  constructor(readonly pkg: DancePackage, progress?: Partial<Progress>) {
    this.clock = new CountClock(pkg)
    const settings = { ...DEFAULT_SETTINGS, ...(progress && progress.settings) }
    this.state = {
      screen: "C",
      runKind: "section",
      section: 1,
      sectionCount: this.clock.sectionCount,
      count: 0,
      and: false,
      runProgress: 0,
      controlsLocked: false,
      doneSections: progress && progress.doneSections ? progress.doneSections.slice() : [],
      settings,
      video: { seekTo: this.clock.sectionStart(1), seekId: 0, playing: false, rate: settings.speed, holdFrame: false, dim: false },
    }
  }

  get view(): ViewState {
    return this.state
  }

  /** Starts a run of a section: the video seeks to its first beat and plays to the end of count 8. */
  playSection(n: number): ViewState {
    const start = this.clock.sectionStart(n)
    this.state = {
      ...this.state,
      screen: "B",
      runKind: "section",
      section: n,
      count: 1,
      and: false,
      runProgress: 0,
      controlsLocked: true,
      video: { ...this.state.video, seekTo: start, seekId: this.state.video.seekId + 1, playing: true, rate: this.state.settings.speed, holdFrame: false },
    }
    return this.state
  }

  /** Advances to the given video time. Returns the new view state. */
  tick(videoTimeSec: number): ViewState {
    const s = this.state
    if (s.screen !== "B") return s
    const start = this.clock.sectionStart(s.section)
    const end = this.clock.sectionEnd(s.section)
    if (videoTimeSec >= end) return this.endRun()
    const { count, and } = this.clock.countIn(s.section, videoTimeSec)
    this.state = { ...s, count, and, runProgress: clamp01((videoTimeSec - start) / (end - start)) }
    return this.state
  }

  private endRun(): ViewState {
    const s = this.state
    const done = s.doneSections.indexOf(s.section) >= 0 ? s.doneSections : s.doneSections.concat(s.section).sort((a, b) => a - b)
    this.state = {
      ...s,
      screen: "C",
      count: 8,
      and: false,
      runProgress: 1,
      controlsLocked: false,
      doneSections: done,
      video: { ...s.video, playing: false },
    }
    return this.state
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
