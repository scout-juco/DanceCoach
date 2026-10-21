/**
 * DanceCoach: the Lens entry point.
 *
 * Loads the dance package, runs the PlaybackController each frame from the video's time,
 * carries out its video requests and hands the view state to the view components.
 * All playback rules live in the controller; this file is only glue.
 */
import { TEST_DANCE } from "../Dance/TestDance"
import { PlaybackController, ScreenId, VideoRequest, ViewState } from "./Core/PlaybackController"
import { PLACEMENT, SCREENS } from "./UI/Layout"
import { VideoWindow } from "./UI/VideoWindow"

@component
export class DanceCoach extends BaseScriptComponent {
  @input
  @hint("The camera the window is placed relative to")
  camera: SceneObject

  @input
  @hint("The window's root object; it's moved to the default placement on start")
  windowRoot: SceneObject

  @input
  videoWindow: VideoWindow

  @input
  @allowUndefined
  @hint("The test dance video (git-ignored). Without it, counts run on a stand-in clock.")
  videoTexture: Texture

  private controller: PlaybackController
  private video: VideoTextureProvider | null = null
  private videoReady = false
  // Stand-in video time when there's no video texture.
  private fakeTime = 0
  private appliedSeekId = -1
  private screen: ScreenId | null = null

  onAwake() {
    this.controller = new PlaybackController(TEST_DANCE)
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  private start() {
    this.placeWindow()
    if (this.videoTexture) {
      this.videoWindow.setVideo(this.videoTexture)
      this.video = this.videoTexture.control as VideoTextureProvider
      const onReady = () => {
        if (this.videoReady) return
        this.videoReady = true
        this.controller.playSection(1)
      }
      this.video.onPlaybackReady.add(onReady)
      if (this.video.isPlaybackReady) onReady()
    } else {
      print("DanceCoach: no video texture assigned; using a stand-in clock")
      this.controller.playSection(1)
    }
    this.render(this.controller.view)
  }

  private update() {
    if (this.video && !this.videoReady) return
    const dt = getDeltaTime()
    const view = this.controller.view
    if (!this.video && view.video.playing) this.fakeTime += dt * view.video.rate
    const t = this.video ? this.video.currentTime : this.fakeTime
    this.render(this.controller.tick(t))
  }

  private render(view: ViewState) {
    this.applyVideo(view.video)
    if (view.screen !== this.screen) {
      this.screen = view.screen
      this.videoWindow.setRect(SCREENS[view.screen].video)
    }
    this.videoWindow.render(view)
  }

  private applyVideo(req: VideoRequest) {
    const seek = req.seekId !== this.appliedSeekId
    this.appliedSeekId = req.seekId
    if (!this.video) {
      if (seek) this.fakeTime = req.seekTo
      return
    }
    const v = this.video
    if (v.playbackRate !== req.rate) v.playbackRate = req.rate
    const status = v.getStatus()
    if (req.playing) {
      if (status === VideoStatus.Stopped || status === VideoStatus.Preparing) v.play(1)
      else if (status === VideoStatus.Paused) v.resume()
    } else if (status === VideoStatus.Playing) {
      v.pause()
    }
    if (seek) v.seek(req.seekTo)
  }

  /** Puts the window at the default placement: ahead, to the right and a little below eye level. */
  private placeWindow() {
    const cam = this.camera.getTransform()
    const look = cam.back
    const flat = new vec3(look.x, 0, look.z).normalize()
    const yaw = quat.angleAxis((-PLACEMENT.yawRightDeg * Math.PI) / 180, vec3.up())
    const dir = yaw.multiplyVec3(flat)
    const pos = cam.getWorldPosition().add(dir.uniformScale(PLACEMENT.distanceCm)).add(new vec3(0, -PLACEMENT.dropCm, 0))
    const t = this.windowRoot.getTransform()
    t.setWorldPosition(pos)
    t.setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }
}
