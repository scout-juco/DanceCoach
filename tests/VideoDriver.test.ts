import { describe, expect, it } from "vitest"
import { planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { PlaybackController, VideoRequest } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { VIDEO_STATUS, VideoDriver, VideoPlayer } from "../DanceCoachLens/Assets/Scripts/Core/VideoDriver"
import { makeDance } from "./fixtures"

/**
 * A stand-in for one clip's VideoTextureProvider, with the quirks measured in Preview:
 * - play() prepares for a frame, then plays from 0 at the playbackRate set before it
 * - seek() while playing is held until the next pause(); seek() while paused is ignored
 * - pause() jumps currentTime to a held seek, but the picture (lastFrameTime) stays put
 * - resume() plays from where it paused (or the held seek)
 * - stop() throws when already stopped; at the end of the clip it stops by itself
 */
class FakeVideo implements VideoPlayer {
  status: number = VIDEO_STATUS.Stopped
  currentTime = 0
  lastFrameTime = 0
  playbackRate = 1
  plays = 0
  private activeRate = 1
  private heldSeek: number | null = null
  private pausedAt = 0

  constructor(readonly duration: number) {}

  play() {
    this.status = VIDEO_STATUS.Preparing
    this.activeRate = this.playbackRate
    this.currentTime = 0
    this.plays++
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
    if (this.status === VIDEO_STATUS.Stopped) throw new Error("Calling stop from invalid state")
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
    if (this.status !== VIDEO_STATUS.Playing) return
    this.currentTime += dt * this.activeRate
    if (this.currentTime >= this.duration) {
      this.currentTime = this.duration
      this.status = VIDEO_STATUS.Stopped
    }
    this.lastFrameTime = this.currentTime
  }
  get rate() {
    return this.activeRate
  }
}

const FRAME = 1 / 30
// The fixture: 120 bpm, first beat at 1 s, sections at 1, 5 and 9 s; clips top (1–13), s2 (3–9), s3 (7–13).
const PLAN = planClips(makeDance())

function setup() {
  const videos = PLAN.map((c) => new FakeVideo(c.end - c.start))
  const shown: string[] = []
  const driver = new VideoDriver(
    PLAN.map((clip, i) => ({ clip, player: videos[i] })),
    (i) => shown.push(PLAN[i].id),
  )
  const video = (id: string) => videos[PLAN.findIndex((c) => c.id === id)]
  return { videos, driver, shown, video }
}

function request(over: Partial<VideoRequest> = {}): VideoRequest {
  return { seekTo: 3, seekId: 1, playing: true, rate: 1, holdFrame: false, dim: false, ...over }
}

/** Runs frames until the driver has landed its seek; returns how long that took. */
function settle(s: ReturnType<typeof setup>, req: VideoRequest, maxSec = 3): number {
  let frames = 0
  s.driver.apply(req, 0)
  while (s.driver.busy && frames * FRAME < maxSec) {
    s.videos.forEach((v) => v.advance(FRAME))
    s.driver.apply(req, FRAME)
    frames++
  }
  return frames * FRAME
}

function frames(s: ReturnType<typeof setup>, req: VideoRequest, seconds: number) {
  for (let t = 0; t < seconds; t += FRAME) {
    s.videos.forEach((v) => v.advance(FRAME))
    s.driver.apply(req, FRAME)
  }
}

describe("VideoDriver", () => {
  it("starts the clip that begins where the run does, from 0", () => {
    const s = setup()
    expect(settle(s, request({ seekTo: 3 }))).toBeLessThan(0.2)
    expect(s.shown).toEqual(["s2"])
    expect(s.video("s2").status).toBe(VIDEO_STATUS.Playing)
    expect(s.driver.time).toBeCloseTo(3, 1)
  })

  it("plays the clip at the run's speed, and the time follows the original video", () => {
    const s = setup()
    settle(s, request({ seekTo: 7, rate: 0.5 }))
    frames(s, request({ seekTo: 7, rate: 0.5 }), 1)
    expect(s.video("s3").rate).toBe(0.5)
    expect(s.driver.time).toBeCloseTo(7.5, 1)
  })

  it("replays a section by starting its clip again", () => {
    const s = setup()
    settle(s, request({ seekTo: 3 }))
    frames(s, request({ seekTo: 3 }), 3)
    frames(s, request({ seekTo: 3, playing: false }), 0.2)
    settle(s, request({ seekId: 2, seekTo: 3 }))
    expect(s.video("s2").plays).toBe(2)
    expect(s.driver.time).toBeCloseTo(3, 1)
  })

  it("switches clips and stops the old one", () => {
    const s = setup()
    settle(s, request({ seekTo: 3 }))
    settle(s, request({ seekId: 2, seekTo: 7 }))
    expect(s.shown).toEqual(["s2", "s3"])
    expect(s.video("s2").status).toBe(VIDEO_STATUS.Stopped)
    expect(s.video("s3").status).toBe(VIDEO_STATUS.Playing)
  })

  it("holds a frozen frame at the start of a clip, then plays on from it", () => {
    const s = setup()
    const frozen = request({ seekTo: 1, playing: false })
    settle(s, frozen)
    frames(s, frozen, 0.5)
    expect(s.video("top").status).toBe(VIDEO_STATUS.Paused)
    expect(s.video("top").lastFrameTime).toBeLessThan(0.25)
    frames(s, request({ seekTo: 1 }), 0.5)
    expect(s.video("top").status).toBe(VIDEO_STATUS.Playing)
    expect(s.driver.time).toBeGreaterThan(1.3)
    expect(s.driver.time).toBeLessThan(1.8)
  })

  it("seeks inside a clip when no clip starts there", () => {
    const s = setup()
    settle(s, request({ seekTo: 4 }))
    expect(s.video("s2").lastFrameTime).toBeCloseTo(1, 1)
    expect(s.driver.time).toBeCloseTo(4, 1)
  })

  it("keeps time running on a held last frame once a clip plays out", () => {
    const s = setup()
    settle(s, request({ seekTo: 7 }))
    frames(s, request({ seekTo: 7 }), 6.5)
    expect(s.video("s3").status).toBe(VIDEO_STATUS.Stopped)
    expect(s.video("s3").plays).toBe(1)
    expect(s.driver.time).toBeGreaterThan(13.4)
  })

  it("is busy until the picture is at the target, so runs don't read the wrong time", () => {
    const s = setup()
    s.driver.apply(request(), 0)
    expect(s.driver.busy).toBe(true)
  })

  it("runs a whole section with the controller", () => {
    const s = setup()
    const pc = new PlaybackController(makeDance())
    pc.tapSection(2)
    for (let i = 0; i < 400 && pc.view.screen !== "C"; i++) {
      s.videos.forEach((v) => v.advance(FRAME))
      s.driver.apply(pc.view.video, FRAME)
      if (!s.driver.busy) pc.tick(s.driver.time, FRAME)
    }
    expect(pc.view).toMatchObject({ screen: "C", section: 2, doneSections: [2] })
  })
})
