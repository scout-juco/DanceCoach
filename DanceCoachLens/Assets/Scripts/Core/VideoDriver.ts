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

  /** Call every frame with the controller's current request. */
  apply(req: VideoRequest, dtSec: number) {
    if (req.seekId !== this.seekId) {
      this.seekId = req.seekId
      this.target = req.seekTo
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
    const p = this.clips[this.active].player
    if (this.ended || p.status === VIDEO_STATUS.Stopped) {
      // The clip has played out: hold its last frame while time runs on.
      if (!this.ended) {
        this.ended = true
        this.endedAt = p.lastFrameTime
      } else if (req.playing) {
        this.endedAt += dtSec * this.rate
      }
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

  /** Gives up on a seek that hasn't landed in time and starts the clip again. */
  private countDown(dtSec: number) {
    this.landLeft -= dtSec
    if (this.landLeft <= 0) this.phase = "start"
  }
}
