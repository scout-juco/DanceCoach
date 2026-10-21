/**
 * DanceCoach: the Lens entry point.
 *
 * Loads the dance package, runs the PlaybackController each frame from the video's time,
 * carries out its video requests and hands the view state to the view components.
 * All playback rules live in the controller; this file is only glue.
 */
import { TEST_DANCE } from "../Dance/TestDance"
import { PlaybackController, ScreenId, VideoRequest, ViewState } from "./Core/PlaybackController"
import { CountInPanel } from "./UI/CountInPanel"
import { PLACEMENT, SCREENS } from "./UI/Layout"
import { ProgressBar } from "./UI/ProgressBar"
import { SectionRow, SectionTap } from "./UI/SectionRow"
import { VideoWindow } from "./UI/VideoWindow"
import { childObject } from "./UI/Visuals"
import { WindowGrab } from "./UI/WindowGrab"

// After a seek, the video's reported time can lag behind for a few frames. Wait until it's
// near the target (or this long has passed) before the controller reads it again.
const SEEK_SETTLE_SEC = 0.5
const SEEK_NEAR_SEC = 0.25
const SEEK_TRIES = 3
// The camera sits at the spawn point until tracking settles, so the window keeps
// re-placing itself in front of you for this long after the Lens starts.
const PLACE_SETTLE_SEC = 1.5

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
  private countIn: CountInPanel
  private progress: ProgressBar
  private sections: SectionRow
  private video: VideoTextureProvider | null = null
  // Stand-in video time when there's no video texture.
  private fakeTime = 0
  private appliedSeekId = -1
  // A seek waits until the video is actually playing or paused; seeking a stopped video does nothing.
  private pendingSeek: number | null = null
  private settle: { target: number; left: number; tries: number } | null = null
  private screen: ScreenId | null = null
  private placeLeft = PLACE_SETTLE_SEC

  onAwake() {
    this.controller = new PlaybackController(TEST_DANCE)
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  private start() {
    this.placeWindow()
    // The other panels sit on the same plane as the video, so they share its parent.
    const plane = this.videoWindow.getSceneObject()
    this.countIn = childObject("CountIn", plane).createComponent(CountInPanel.getTypeName()) as CountInPanel
    this.progress = childObject("Progress", plane).createComponent(ProgressBar.getTypeName()) as ProgressBar
    this.sections = childObject("Sections", plane).createComponent(SectionRow.getTypeName()) as SectionRow
    this.sections.onTap = (id) => this.tapSection(id)
    // Developer helper: drag the video to try out placements. The video's smallest rect
    // (Clip ended) is inside it on every screen, so the grab area never covers a button.
    const grab = childObject("Grab", plane).createComponent(WindowGrab.getTypeName()) as WindowGrab
    grab.setup(this.windowRoot, SCREENS.C.video)
    grab.onMoving = () => {
      this.placeLeft = 0
      this.faceCamera()
    }
    grab.onMoved = () => {
      this.faceCamera()
      this.logPlacement()
    }
    if (this.videoTexture) {
      this.videoWindow.setVideo(this.videoTexture)
      this.video = this.videoTexture.control as VideoTextureProvider
      this.video.onPlaybackReady.add(() => this.videoWindow.fitVideo())
    } else {
      print("DanceCoach: no video texture assigned; using a stand-in clock")
    }
    this.render(this.controller.tapSection(1))
  }

  private tapSection(id: SectionTap) {
    // Full arrives with From the top (M1-04).
    if (id === "full") return
    this.render(this.controller.tapSection(id))
  }

  private update() {
    const dt = getDeltaTime()
    if (this.placeLeft > 0) {
      this.placeLeft -= dt
      this.placeWindow()
    }
    const view = this.controller.view
    if (!this.video && view.video.playing) this.fakeTime += dt * view.video.rate
    // Until a seek has landed, the video's time isn't the run's time yet.
    if (this.video && (this.pendingSeek !== null || this.settling(dt))) {
      this.render(view)
      return
    }
    const t = this.video ? this.video.currentTime : this.fakeTime
    this.render(this.controller.tick(t, dt))
  }

  private settling(dt: number): boolean {
    const s = this.settle
    if (!s) return false
    if (Math.abs(this.video!.currentTime - s.target) < SEEK_NEAR_SEC) {
      this.settle = null
      return false
    }
    s.left -= dt
    if (s.left <= 0) {
      // A seek issued while the video is still starting up can be dropped: try again, then give up.
      if (s.tries >= SEEK_TRIES) this.settle = null
      else {
        this.video!.seek(s.target)
        s.tries++
        s.left = SEEK_SETTLE_SEC
      }
    }
    return this.settle !== null
  }

  private render(view: ViewState) {
    this.applyVideo(view.video)
    if (view.screen !== this.screen) {
      this.screen = view.screen
      this.videoWindow.setRect(SCREENS[view.screen].video)
    }
    this.videoWindow.render(view)
    this.countIn.render(view)
    this.progress.render(view)
    this.sections.render(view)
  }

  private applyVideo(req: VideoRequest) {
    const seek = req.seekId !== this.appliedSeekId
    this.appliedSeekId = req.seekId
    if (!this.video) {
      if (seek) this.fakeTime = req.seekTo
      return
    }
    const v = this.video
    if (seek) this.pendingSeek = req.seekTo
    if (v.playbackRate !== req.rate) v.playbackRate = req.rate
    let status = v.status
    if (this.pendingSeek !== null) {
      // Seeking needs a started video, even for a frozen frame; it's paused again once the seek lands.
      if (status === VideoStatus.Stopped) {
        v.play(1)
        return
      }
      if (status === VideoStatus.Playing || status === VideoStatus.Paused) {
        v.seek(this.pendingSeek)
        this.settle = { target: this.pendingSeek, left: SEEK_SETTLE_SEC, tries: 1 }
        this.pendingSeek = null
        // The video's aspect is known by now, whether or not onPlaybackReady fired.
        this.videoWindow.fitVideo()
      }
    }
    status = v.status
    if (req.playing) {
      if (status === VideoStatus.Stopped) v.play(1)
      else if (status === VideoStatus.Paused) v.resume()
    } else if (status === VideoStatus.Playing && !this.settle) {
      // Pausing straight after a seek drops the seek, so a frozen frame pauses once it has landed.
      v.pause()
    }
  }

  /** Puts the window at the default placement: ahead, to the right and a little below eye level. */
  private placeWindow() {
    const yaw = quat.angleAxis((-PLACEMENT.yawRightDeg * Math.PI) / 180, vec3.up())
    const dir = yaw.multiplyVec3(this.lookFlat())
    const pos = this.camera.getTransform().getWorldPosition().add(dir.uniformScale(PLACEMENT.distanceCm)).add(new vec3(0, -PLACEMENT.dropCm, 0))
    this.windowRoot.getTransform().setWorldPosition(pos)
    this.faceCamera()
  }

  /** Turns the window (about the vertical only) to face you. */
  private faceCamera() {
    const dir = this.toWindowFlat()
    this.windowRoot.getTransform().setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }

  /** Prints where the window is, in PLACEMENT's terms, so a dragged position can become the default. */
  private logPlacement() {
    const cam = this.camera.getTransform().getWorldPosition()
    const d = this.windowRoot.getTransform().getWorldPosition().sub(cam)
    const look = this.lookFlat()
    const dir = this.toWindowFlat()
    const yawRightDeg = (-Math.atan2(look.cross(dir).y, look.dot(dir)) * 180) / Math.PI
    const distanceCm = new vec3(d.x, 0, d.z).length
    print(`DanceCoach placement: { distanceCm: ${distanceCm.toFixed(0)}, yawRightDeg: ${yawRightDeg.toFixed(0)}, dropCm: ${(-d.y).toFixed(0)} }`)
  }

  /** The way you're facing, flattened to the floor. */
  private lookFlat(): vec3 {
    const look = this.camera.getTransform().back
    return new vec3(look.x, 0, look.z).normalize()
  }

  /** The direction from you to the window, flattened to the floor. */
  private toWindowFlat(): vec3 {
    const d = this.windowRoot.getTransform().getWorldPosition().sub(this.camera.getTransform().getWorldPosition())
    return new vec3(d.x, 0, d.z).normalize()
  }
}
