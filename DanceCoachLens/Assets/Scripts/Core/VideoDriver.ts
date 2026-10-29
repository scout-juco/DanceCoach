/**
 * VideoDriver: carries out the controller's video requests on Lens Studio's video players.
 *
 * Pure (no Lens Studio APIs), so Vitest can drive it with fake players. The player's quirks,
 * measured in Preview (M1-03):
 * - it can't jump forward: a forward seek, or a start time, plays through to the new time at
 *   playback speed while the Lens freezes; starting from 0 is quick
 * - seek() while playing is held until the next pause(); while paused it's ignored
 * - pause() moves currentTime to a held seek, but the picture stays put until resume()
 * - playbackRate only applies when the video starts
 *
 * So the dance is cut into clips (ClipPlan), and a seek starts the clip that begins there,
 * from 0, at the run's speed. A seek inside a clip (rare) plays, seeks, pauses and resumes.
 * Either way it waits until the frame on screen is at the target; until then the driver is
 * busy and the controller must not read the video's time.
 */
import { Clip, clipFor } from "./ClipPlan"
import { VideoRequest } from "./PlaybackController"

/** The player's status values (Lens Studio's VideoStatus). */
export const VIDEO_STATUS = { Stopped: 0, Preparing: 1, Playing: 2, Paused: 3 } as const

/** The part of Lens Studio's VideoTextureProvider the driver uses. */
export interface VideoPlayer {
  readonly status: number
  readonly currentTime: number
  readonly lastFrameTime: number
  /** The clip's length in seconds, once it has prepared. */
  readonly totalDuration?: number
  playbackRate: number
  play(playCount: number): void
  pause(): void
  resume(): void
  stop(): void
  seek(time: number): boolean
}

export interface ClipPlayer {
  clip: Clip
  player: VideoPlayer
}

// The frame on screen counts as at the target within this many seconds.
const NEAR_SEC = 0.25
// If the picture hasn't reached the target after this long, start the clip again.
const LAND_SEC = 1.5
// A clip is held on its picture this long before its end, so it never stops.
const END_HOLD_SEC = 0.1
// The next clip of a range starts preparing this long before the video reaches its start.
const PRESTART_SEC = 0.5
// Clip starts closer than this are the same start (as in ClipPlan).
const SAME_START_SEC = 0.05

type Phase = "start" | "wait" | "kick" | "land"

export class VideoDriver {
  private target: number | null = null
  private phase: Phase = "start"
  private seekId = -1
  private active = -1
  private next = 0
  private offset = 0
  private rate = 1
  private landLeft = 0
  // Once a clip has played to its end, time carries on past it (the last section counts on to 8).
  private ended = false
  private endedAt = 0
  // A range plays on into the next section's clip: that clip is started early (ahead), held on its
  // first frame, released when the video reaches its start, and takes over when the active one ends.
  private runEnd = 0
  private ahead = -1
  private aheadHeld = false
  private aheadReleased = false

  /**
   * @param clips one player per clip
   * @param onShow called when a different clip's picture should show in the window
   */
  constructor(
    private readonly clips: ClipPlayer[],
    private readonly onShow: (index: number) => void = () => {},
  ) {}

  /** True while a seek is on its way: the video's time isn't the run's time yet. */
  get busy(): boolean {
    return this.target !== null
  }

  /** The time in the original video, for the controller. Only meaningful while not busy and playing. */
  get time(): number {
    if (this.active < 0) return 0
    const { clip, player } = this.clips[this.active]
    return clip.start + (this.ended ? this.endedAt : player.currentTime)
  }

  /** Stops whatever is playing, for when the dance is swapped out. */
  stop() {
    for (const i of [this.active, this.ahead]) {
      if (i < 0) continue
      const p = this.clips[i].player
      if (p.status !== VIDEO_STATUS.Stopped) p.stop()
    }
    this.ahead = -1
  }

  /** Call every frame with the controller's current request. */
  apply(req: VideoRequest, dtSec: number) {
    if (req.seekId !== this.seekId) {
      this.seekId = req.seekId
      this.target = req.seekTo
      this.runEnd = req.runEnd
      const at = clipFor(
        this.clips.map((c) => c.clip),
        req.seekTo,
      )
      this.next = this.clips.findIndex((c) => c.clip === at.clip)
      this.offset = at.offset
      this.phase = "start"
    }
    if (this.target !== null) {
      this.stepSeek(req, dtSec)
      return
    }
    if (!this.ended) this.stepChain()
    const p = this.clips[this.active].player
    if (this.ended || p.status === VIDEO_STATUS.Stopped) {
      // The clip has played out (it can stop a frame short of its end): hold its last frame while time runs on.
      if (!this.ended) {
        this.ended = true
        this.endedAt = p.lastFrameTime
      } else if (req.playing) {
        this.endedAt += dtSec * this.rate
      }
      return
    }
    // A clip that plays out stops, and a stopped video can drop its picture. Pause on its last
    // frames instead, which holds the picture, and let time carry on past the end as before.
    if (p.status === VIDEO_STATUS.Playing && p.totalDuration && p.currentTime >= p.totalDuration - END_HOLD_SEC) {
      p.pause()
      this.ended = true
      this.endedAt = p.currentTime
      return
    }
    if (req.playing) {
      if (p.status === VIDEO_STATUS.Paused) p.resume()
    } else if (p.status === VIDEO_STATUS.Playing) {
      p.pause()
    }
  }

  private stepSeek(req: VideoRequest, dtSec: number) {
    switch (this.phase) {
      case "start": {
        // A new run drops any clip started ahead for the last one.
        if (this.dropAhead()) return
        // Stop whatever is running, then start the target clip from 0 at the run's speed.
        if (this.active >= 0) {
          const old = this.clips[this.active].player
          if (old.status === VIDEO_STATUS.Preparing) return
          if (old.status !== VIDEO_STATUS.Stopped) old.stop()
        }
        if (this.active !== this.next) {
          this.active = this.next
          this.onShow(this.next)
        }
        const p = this.clips[this.active].player
        p.playbackRate = req.rate
        p.play(1)
        this.rate = req.rate
        this.ended = false
        this.phase = "wait"
        this.landLeft = LAND_SEC
        return
      }
      case "wait": {
        const p = this.clips[this.active].player
        if (p.status !== VIDEO_STATUS.Playing) return this.countDown(dtSec)
        if (this.offset < NEAR_SEC) {
          this.phase = "land"
          return this.stepSeek(req, dtSec)
        }
        // seek() takes hold on the next pause; resuming shows it.
        p.seek(this.offset)
        p.pause()
        this.phase = "kick"
        return
      }
      case "kick": {
        const p = this.clips[this.active].player
        if (p.status === VIDEO_STATUS.Paused) {
          p.resume()
          this.phase = "land"
        }
        return this.countDown(dtSec)
      }
      case "land": {
        const p = this.clips[this.active].player
        if (p.status === VIDEO_STATUS.Playing && Math.abs(p.lastFrameTime - this.offset) < NEAR_SEC) {
          this.target = null
          // A frozen frame (the starting pose) holds once it's on screen.
          if (!req.playing) p.pause()
          return
        }
        return this.countDown(dtSec)
      }
    }
  }

  /** The clip a run that outlasts the active one carries on into: the next to start inside it. -1 when the run ends in it. */
  private chainNext(): number {
    const cur = this.clips[this.active].clip
    if (this.runEnd <= cur.end + SAME_START_SEC) return -1
    let best = -1
    this.clips.forEach(({ clip }, i) => {
      if (clip.start <= cur.start + SAME_START_SEC || clip.start > cur.end) return
      if (best < 0 || clip.start < this.clips[best].clip.start) best = i
    })
    return best
  }

  /** Starts the next clip early, holds it on its first frame, releases it at its start and hands over when the active clip ends. */
  private stepChain() {
    const next = this.ahead >= 0 ? this.ahead : this.chainNext()
    if (next < 0) return
    const cur = this.clips[this.active]
    const n = this.clips[next]
    const t = cur.clip.start + cur.player.currentTime
    if (this.ahead < 0) {
      if (t < n.clip.start - PRESTART_SEC) return
      n.player.playbackRate = this.rate
      n.player.play(1)
      this.ahead = next
      this.aheadHeld = false
      this.aheadReleased = false
      return
    }
    const a = n.player
    if (!this.aheadHeld && a.status === VIDEO_STATUS.Playing) {
      a.pause()
      this.aheadHeld = true
    }
    if (this.aheadHeld && !this.aheadReleased && t >= n.clip.start) {
      a.resume()
      this.aheadReleased = true
    }
    const p = cur.player
    const over = p.status === VIDEO_STATUS.Stopped || (!!p.totalDuration && p.currentTime >= p.totalDuration - END_HOLD_SEC)
    if (!over || !this.aheadReleased) return
    // Hand over: the next clip is already showing the same moment, so the picture carries on.
    if (p.status !== VIDEO_STATUS.Stopped) p.stop()
    this.active = next
    this.ahead = -1
    this.onShow(next)
  }

  /** Stops a clip that was started ahead and isn't wanted. True while it can't be stopped yet (still preparing). */
  private dropAhead(): boolean {
    if (this.ahead < 0) return false
    const a = this.clips[this.ahead].player
    if (a.status === VIDEO_STATUS.Preparing) return true
    if (a.status !== VIDEO_STATUS.Stopped) a.stop()
    this.ahead = -1
    return false
  }

  /** Gives up on a seek that hasn't landed in time and starts the clip again. */
  private countDown(dtSec: number) {
    this.landLeft -= dtSec
    if (this.landLeft <= 0) this.phase = "start"
  }
}
