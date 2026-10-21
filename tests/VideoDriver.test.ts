import { describe, expect, it } from "vitest"
import { VideoRequest } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { VIDEO_STATUS, VideoDriver, VideoPlayer } from "../DanceCoachLens/Assets/Scripts/Core/VideoDriver"

/**
 * A stand-in for Lens Studio's VideoTextureProvider with the quirks measured in Preview:
 * - play() prepares for a frame, then plays from 0 at the playbackRate set before it
 * - seek() while playing is held until the next pause(); seek() while paused is ignored
 * - pause() jumps currentTime to a held seek, but the picture (lastFrameTime) stays put
 * - resume() plays from where it paused (or the held seek)
 * - while paused, currentTime keeps counting; lastFrameTime doesn't
 */
class FakeVideo implements VideoPlayer {
  status: number = VIDEO_STATUS.Stopped
  currentTime = 0
  lastFrameTime = 0
  playbackRate = 1
  private activeRate = 1
  private heldSeek: number | null = null
  private pausedAt = 0

  play() {
    this.status = VIDEO_STATUS.Preparing
    this.activeRate = this.playbackRate
    this.currentTime = 0
  }
  pause() {
    if (this.status !== VIDEO_STATUS.Playing) throw new Error("Calling pause from invalid state")
    this.status = VIDEO_STATUS.Paused
    if (this.heldSeek !== null) this.currentTime = this.heldSeek
    this.heldSeek = null
    this.pausedAt = this.currentTime
  }
  resume() {
    if (this.status !== VIDEO_STATUS.Paused) return
    this.status = VIDEO_STATUS.Playing
    this.currentTime = this.pausedAt
  }
  stop() {
    this.status = VIDEO_STATUS.Stopped
    this.heldSeek = null
  }
  seek(time: number) {
    if (this.status === VIDEO_STATUS.Playing) this.heldSeek = time
    return true
  }
  /** One frame of real time. */
  advance(dt: number) {
    if (this.status === VIDEO_STATUS.Preparing) {
      this.status = VIDEO_STATUS.Playing
      return
    }
    if (this.status === VIDEO_STATUS.Playing) {
      this.currentTime += dt * this.activeRate
      this.lastFrameTime = this.currentTime
    } else if (this.status === VIDEO_STATUS.Paused) {
      this.currentTime += dt * this.activeRate
    }
  }
  get rate() {
    return this.activeRate
  }
}

const FRAME = 1 / 30

function request(over: Partial<VideoRequest> = {}): VideoRequest {
  return { seekTo: 8.5, seekId: 1, playing: true, rate: 1, holdFrame: false, dim: false, ...over }
}

/** Runs frames until the driver has landed its seek (or gives up after `maxSec`). */
function settle(video: FakeVideo, driver: VideoDriver, req: VideoRequest, maxSec = 3): number {
  let frames = 0
  driver.apply(req, 0)
  while (driver.busy && frames * FRAME < maxSec) {
    video.advance(FRAME)
    driver.apply(req, FRAME)
    frames++
  }
  return frames * FRAME
}

describe("VideoDriver", () => {
  it("starts a stopped video at the requested time", () => {
    const video = new FakeVideo()
    const driver = new VideoDriver(video)
    expect(settle(video, driver, request())).toBeLessThan(0.5)
    expect(video.status).toBe(VIDEO_STATUS.Playing)
    expect(video.lastFrameTime).toBeCloseTo(8.5, 1)
  })

  it("goes back for a replay from Clip ended, instead of carrying on", () => {
    const video = new FakeVideo()
    const driver = new VideoDriver(video)
    settle(video, driver, request())
    for (let i = 0; i < 90; i++) video.advance(FRAME)
    // Clip ended: paused at about 11.5 s.
    driver.apply(request({ playing: false }), FRAME)
    video.advance(FRAME)
    expect(video.status).toBe(VIDEO_STATUS.Paused)
    settle(video, driver, request({ seekId: 2 }))
    expect(video.status).toBe(VIDEO_STATUS.Playing)
    expect(video.lastFrameTime).toBeCloseTo(8.5, 1)
    expect(driver.time).toBeCloseTo(8.5, 1)
  })

  it("restarts the video to change speed, then seeks", () => {
    const video = new FakeVideo()
    const driver = new VideoDriver(video)
    settle(video, driver, request())
    driver.apply(request({ playing: false }), FRAME)
    video.advance(FRAME)
    settle(video, driver, request({ seekId: 2, seekTo: 4.5, rate: 0.5 }))
    expect(video.rate).toBe(0.5)
    expect(video.lastFrameTime).toBeCloseTo(4.5, 1)
  })

  it("holds a frozen frame at the requested time", () => {
    const video = new FakeVideo()
    const driver = new VideoDriver(video)
    const req = request({ playing: false, seekTo: 10 })
    settle(video, driver, req)
    video.advance(FRAME)
    driver.apply(req, FRAME)
    expect(video.status).toBe(VIDEO_STATUS.Paused)
    expect(video.lastFrameTime).toBeCloseTo(10, 1)
  })

  it("plays again from the frozen frame without seeking", () => {
    const video = new FakeVideo()
    const driver = new VideoDriver(video)
    settle(video, driver, request({ playing: false, seekTo: 10 }))
    video.advance(FRAME)
    driver.apply(request({ playing: false, seekTo: 10 }), FRAME)
    driver.apply(request({ playing: true, seekTo: 10 }), FRAME)
    video.advance(FRAME)
    expect(driver.busy).toBe(false)
    expect(video.status).toBe(VIDEO_STATUS.Playing)
    expect(video.lastFrameTime).toBeGreaterThan(10)
    expect(video.lastFrameTime).toBeLessThan(10.2)
  })

  it("is busy until the picture is at the target, so runs don't read the wrong time", () => {
    const video = new FakeVideo()
    const driver = new VideoDriver(video)
    driver.apply(request(), 0)
    expect(driver.busy).toBe(true)
    video.advance(FRAME)
    driver.apply(request(), FRAME)
    expect(driver.busy).toBe(true)
  })
})
