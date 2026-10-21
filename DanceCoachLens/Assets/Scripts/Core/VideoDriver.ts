/**
 * VideoDriver: carries out the controller's video requests on Lens Studio's video player.
 *
 * Pure (no Lens Studio APIs), so Vitest can drive it with a fake player. The player's
 * quirks, measured in Preview (M1-03):
 * - seek() while playing returns true but is held until the next pause(); while paused it's ignored
 * - pause() moves currentTime to a held seek, but the picture stays put until resume()
 * - while paused, currentTime keeps counting; lastFrameTime (the frame on screen) doesn't
 * - playbackRate only applies when the video starts, so a new speed needs stop() and play()
 *
 * So a seek is: play, seek, pause, resume, then wait until the frame on screen is at the target.
 * Until then the driver is busy and the controller must not read the video's time.
 */
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

// The frame on screen counts as at the target within this many seconds.
const NEAR_SEC = 0.25
// If the picture hasn't reached the target after this long, seek again.
const LAND_SEC = 1

type Phase = "restart" | "seek" | "kick" | "land"

export class VideoDriver {
  private target: number | null = null
  private phase: Phase = "seek"
  private seekId = -1
  private startedRate = 1
  private landLeft = 0

  constructor(private readonly video: VideoPlayer) {}

  /** True while a seek is on its way: the video's time isn't the run's time yet. */
  get busy(): boolean {
    return this.target !== null
  }

  /** The video time for the controller. Only meaningful while not busy and playing. */
  get time(): number {
    return this.video.currentTime
  }

  /** Call every frame with the controller's current request. */
  apply(req: VideoRequest, dtSec: number) {
    const v = this.video
    if (req.seekId !== this.seekId) {
      this.seekId = req.seekId
      this.target = req.seekTo
      const running = v.status !== VIDEO_STATUS.Stopped
      this.phase = running && this.startedRate !== req.rate ? "restart" : "seek"
    }
    if (this.target !== null) {
      this.stepSeek(req, dtSec)
      return
    }
    const status = v.status
    if (req.playing) {
      if (status === VIDEO_STATUS.Stopped) this.play(req.rate)
      else if (status === VIDEO_STATUS.Paused) v.resume()
    } else if (status === VIDEO_STATUS.Playing) {
      v.pause()
    }
  }

  private stepSeek(req: VideoRequest, dtSec: number) {
    const v = this.video
    const status = v.status
    const target = this.target!
    switch (this.phase) {
      case "restart":
        // A new speed: stop, then start again at the new rate.
        if (status !== VIDEO_STATUS.Stopped) v.stop()
        else {
          this.play(req.rate)
          this.phase = "seek"
        }
        return
      case "seek":
        // seek() only takes hold on a playing video.
        if (status === VIDEO_STATUS.Stopped) this.play(req.rate)
        else if (status === VIDEO_STATUS.Paused) v.resume()
        else if (status === VIDEO_STATUS.Playing) {
          v.seek(target)
          v.pause()
          this.phase = "kick"
        }
        return
      case "kick":
        // The pause applies the seek; resuming shows it.
        if (status === VIDEO_STATUS.Paused) {
          v.resume()
          this.phase = "land"
          this.landLeft = LAND_SEC
        }
        return
      case "land":
        if (status === VIDEO_STATUS.Playing && Math.abs(v.lastFrameTime - target) < NEAR_SEC) {
          this.target = null
          // A frozen frame (the starting pose) holds once it's on screen.
          if (!req.playing) v.pause()
          return
        }
        this.landLeft -= dtSec
        if (this.landLeft <= 0) this.phase = "seek"
        return
    }
  }

  private play(rate: number) {
    this.video.playbackRate = rate
    this.startedRate = rate
    this.video.play(1)
  }
}
