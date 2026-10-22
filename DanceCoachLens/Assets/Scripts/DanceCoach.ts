/**
 * DanceCoach: the Lens entry point.
 *
 * Loads the dance package, runs the PlaybackController each frame from the video's time,
 * carries out its video requests and hands the view state to the view components.
 * All playback rules live in the controller; this file is only glue.
 */
import { TEST_DANCE } from "../Dance/TestDance"
import { clipAssetName, planClips } from "./Core/ClipPlan"
import { PlaybackController, ScreenId, Settings, VideoRequest, ViewState } from "./Core/PlaybackController"
import { decodeSettings, encodeSettings, SETTINGS_KEY } from "./Core/SettingsStore"
import { ClipPlayer, VideoDriver } from "./Core/VideoDriver"
import { ControlBar, ControlCommand } from "./UI/ControlBar"
import { CountInPanel } from "./UI/CountInPanel"
import { PLACEMENT, SCREENS } from "./UI/Layout"
import { ProgressBar } from "./UI/ProgressBar"
import { SectionRow, SectionTap } from "./UI/SectionRow"
import { Toast } from "./UI/Toast"
import { VideoWindow } from "./UI/VideoWindow"
import { childObject } from "./UI/Visuals"
import { WindowGrab } from "./UI/WindowGrab"

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
  @hint("The dance's clips, cut by `npm run clips` (git-ignored), in any order. Without them, counts run on a stand-in clock.")
  videoClips: Texture[]

  private controller: PlaybackController
  private countIn: CountInPanel
  private progress: ProgressBar
  private sections: SectionRow
  private controls: ControlBar
  private toast: Toast
  private driver: VideoDriver | null = null
  // Stand-in video time when there's no video texture.
  private fakeTime = 0
  private fakeSeekId = -1
  private screen: ScreenId | null = null
  private placeLeft = PLACE_SETTLE_SEC
  private savedSettings: Settings | null = null

  onAwake() {
    const settings = decodeSettings(global.persistentStorageSystem.store.getString(SETTINGS_KEY))
    this.controller = new PlaybackController(TEST_DANCE, { settings })
    this.savedSettings = this.controller.view.settings
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
    this.controls = childObject("Controls", plane).createComponent(ControlBar.getTypeName()) as ControlBar
    this.controls.onPress = (command) => this.press(command)
    this.toast = childObject("Toast", plane).createComponent(Toast.getTypeName()) as Toast
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
    const clips = this.findClips()
    if (clips) {
      this.driver = new VideoDriver(clips.players, (i) => this.videoWindow.setVideo(clips.textures[i]))
    } else {
      print("DanceCoach: no video clips assigned; using a stand-in clock")
    }
    this.render(this.controller.tapSection(1))
  }

  /** Matches the clip textures to the clip plan by name; null if any clip is missing. */
  private findClips(): { players: ClipPlayer[]; textures: Texture[] } | null {
    const assigned = (this.videoClips || []).filter((t) => !!t)
    if (assigned.length === 0) return null
    const players: ClipPlayer[] = []
    const textures: Texture[] = []
    for (const clip of planClips(TEST_DANCE)) {
      const name = clipAssetName(TEST_DANCE.video, clip.id)
      const texture = assigned.find((t) => t.name.replace(/\.[^.]+$/, "") === name)
      if (!texture) {
        print(`DanceCoach: clip ${name} isn't assigned to Video Clips (run npm run clips, then add it)`)
        return null
      }
      const player = texture.control as VideoTextureProvider
      player.volume = 1
      player.onPlaybackReady.add(() => this.videoWindow.fitVideo())
      players.push({ clip, player })
      textures.push(texture)
    }
    return { players, textures }
  }

  private tapSection(id: SectionTap) {
    // Full arrives with From the top (M1-04).
    if (id === "full") return
    this.render(this.controller.tapSection(id))
  }

  private press(command: ControlCommand) {
    const c = this.controller
    switch (command) {
      case "replay":
        return this.render(c.replay())
      case "mirror":
        return this.render(c.toggleMirror())
      case "counts":
        return this.render(c.toggleCounts())
      case "mode":
        return this.render(c.tapMode())
      default:
        return this.render(c.setSpeed(command))
    }
  }

  private update() {
    const dt = getDeltaTime()
    if (this.placeLeft > 0) {
      this.placeLeft -= dt
      this.placeWindow()
    }
    // Video requests are carried out once a frame, here; a command's request lands on the next frame.
    const view = this.controller.view
    if (!this.driver) {
      this.applyFakeVideo(view.video, dt)
      this.render(this.controller.tick(this.fakeTime, dt))
      return
    }
    // Until a seek has landed, the video's time isn't the run's time yet.
    const wasBusy = this.driver.busy
    this.driver.apply(view.video, dt)
    if (this.driver.busy) {
      this.render(view)
      return
    }
    // The video's aspect is known once a seek has landed, whether or not onPlaybackReady fired.
    if (wasBusy) this.videoWindow.fitVideo()
    this.render(this.controller.tick(this.driver.time, dt))
  }

  private render(view: ViewState) {
    if (view.screen !== this.screen) {
      this.screen = view.screen
      this.videoWindow.setRect(SCREENS[view.screen].video)
    }
    this.videoWindow.render(view)
    this.countIn.render(view)
    this.progress.render(view)
    this.sections.render(view)
    this.controls.render(view)
    this.toast.render(view)
    this.saveSettings(view.settings)
  }

  /** Writes speed, mirror and counts to persistent storage whenever they change. */
  private saveSettings(settings: Settings) {
    if (settings === this.savedSettings) return
    this.savedSettings = settings
    global.persistentStorageSystem.store.putString(SETTINGS_KEY, encodeSettings(settings))
  }

  /** Without a video texture, a stand-in clock follows the video requests. */
  private applyFakeVideo(req: VideoRequest, dtSec: number) {
    if (req.seekId !== this.fakeSeekId) {
      this.fakeSeekId = req.seekId
      this.fakeTime = req.seekTo
    } else if (req.playing) {
      this.fakeTime += dtSec * req.rate
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
