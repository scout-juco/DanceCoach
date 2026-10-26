/**
 * DanceCoach: the Lens entry point.
 *
 * Loads the dance package, runs the PlaybackController each frame from the video's time,
 * carries out its video requests and hands the view state to the view components.
 * All playback rules live in the controller; this file is only glue.
 */
import { TEST_DANCE } from "../Dance/TestDance"
import { clipAssetName, planClips } from "./Core/ClipPlan"
import { CountCaller } from "./Core/CountCaller"
import { PlaybackController, RoutineDoneChoice, SectionTap, Settings, VideoRequest, ViewState } from "./Core/PlaybackController"
import { decodeSettings, encodeSettings, finishReadyKey, firstLookKey, SETTINGS_KEY } from "./Core/SettingsStore"
import { ClipPlayer, VideoDriver } from "./Core/VideoDriver"
import { Banner } from "./UI/Banner"
import { ControlBar, ControlCommand } from "./UI/ControlBar"
import { CountInPanel } from "./UI/CountInPanel"
import { panelsFor, PanelId, PLACEMENT, PxRect, SCREENS } from "./UI/Layout"
import { PopupCard } from "./UI/PopupCard"
import { ProgressBar } from "./UI/ProgressBar"
import { SectionRow } from "./UI/SectionRow"
import { SegBar } from "./UI/SegBar"
import { SkipButton } from "./UI/SkipButton"
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
  @hint("Developer: play the first look on every open, as if it had never been seen")
  alwaysFirstLook: boolean = false

  @input
  @allowUndefined
  @hint("The dance's clips, cut by `npm run clips` (git-ignored), in any order. Without them, counts run on a stand-in clock.")
  videoClips: Texture[]

  // The spoken counts in Audio/Counts, made by scripts/makeCountVoice.ps1. One slot each
  // rather than an array, so tooling can assign them; with any missing, counts stay silent.
  @input @allowUndefined count1: AudioTrackAsset
  @input @allowUndefined count2: AudioTrackAsset
  @input @allowUndefined count3: AudioTrackAsset
  @input @allowUndefined count4: AudioTrackAsset
  @input @allowUndefined count5: AudioTrackAsset
  @input @allowUndefined count6: AudioTrackAsset
  @input @allowUndefined count7: AudioTrackAsset
  @input @allowUndefined count8: AudioTrackAsset

  private controller: PlaybackController
  private caller = new CountCaller()
  private voice: AudioComponent | null = null
  // countTracks[n] says n; empty without the spoken counts.
  private countTracks: AudioTrackAsset[] = []
  private countIn: CountInPanel
  private progress: ProgressBar
  private segBar: SegBar
  private banner: Banner
  private sections: SectionRow
  private controls: ControlBar
  private toast: Toast
  private skip: SkipButton
  private popup: PopupCard
  private driver: VideoDriver | null = null
  // Stand-in video time when there's no video texture.
  private fakeTime = 0
  private fakeSeekId = -1
  private panels: Partial<Record<PanelId, PxRect>> | null = null
  private placeLeft = PLACE_SETTLE_SEC
  private savedSettings: Settings | null = null
  private savedFirstLook = false
  private savedFinishReady = false

  onAwake() {
    const store = global.persistentStorageSystem.store
    const settings = decodeSettings(store.getString(SETTINGS_KEY))
    this.savedFirstLook = store.getBool(firstLookKey(TEST_DANCE.id))
    const firstLookSeen = this.savedFirstLook && !this.alwaysFirstLook
    if (this.savedFirstLook && !firstLookSeen) print("DanceCoach: playing the first look again (Always First Look is on)")
    this.savedFinishReady = store.getBool(finishReadyKey(TEST_DANCE.id))
    this.controller = new PlaybackController(TEST_DANCE, { settings, firstLookSeen, finishReady: this.savedFinishReady })
    // Saved again only when the first look ends.
    this.savedFirstLook = firstLookSeen
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
    this.segBar = childObject("SegBar", plane).createComponent(SegBar.getTypeName()) as SegBar
    this.banner = childObject("Banner", plane).createComponent(Banner.getTypeName()) as Banner
    this.sections = childObject("Sections", plane).createComponent(SectionRow.getTypeName()) as SectionRow
    this.sections.onTap = (id) => this.tapSection(id)
    this.controls = childObject("Controls", plane).createComponent(ControlBar.getTypeName()) as ControlBar
    this.controls.onPress = (command) => this.press(command)
    this.toast = childObject("Toast", plane).createComponent(Toast.getTypeName()) as Toast
    this.skip = childObject("Skip", plane).createComponent(SkipButton.getTypeName()) as SkipButton
    this.skip.onPress = () => {
      print("DanceCoach: Skip to Section 1 pressed")
      this.render(this.controller.skipFirstLook())
    }
    this.popup = childObject("Popup", this.getSceneObject()).createComponent(PopupCard.getTypeName()) as PopupCard
    this.popup.setup(this.camera)
    this.popup.onChoose = (choice) => this.chooseRoutineDone(choice)
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
    this.setupVoice()
    this.render(this.controller.open())
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

  /** Sets up the spoken counts; with any missing, counts stay silent. */
  private setupVoice() {
    const tracks = [null, this.count1, this.count2, this.count3, this.count4, this.count5, this.count6, this.count7, this.count8]
    const missing = tracks.findIndex((t, n) => n > 0 && !t)
    if (missing > 0) {
      print(`DanceCoach: Count ${missing} isn't assigned; counts stay silent`)
      return
    }
    this.countTracks = tracks
    this.voice = this.getSceneObject().createComponent("Component.AudioComponent") as AudioComponent
    // The word has to land on the beat.
    this.voice.playbackMode = Audio.PlaybackMode.LowLatency
  }

  /** Says the count when a new one starts; a new word cuts off the one before. */
  private callCount(view: ViewState) {
    const n = this.caller.next(view)
    if (n === 0 || !this.voice) return
    if (this.voice.isPlaying()) this.voice.stop(false)
    this.voice.audioTrack = this.countTracks[n]
    this.voice.play(1)
  }

  private tapSection(id: SectionTap) {
    this.render(this.controller.tapSection(id))
  }

  private chooseRoutineDone(choice: RoutineDoneChoice) {
    print(`DanceCoach: Routine done: ${choice}`)
    this.render(this.controller.routineDone(choice))
  }

  private press(command: ControlCommand) {
    const c = this.controller
    switch (command) {
      case "replay":
        return this.render(c.replay())
      case "top":
        return this.render(c.fromTheTop())
      case "mirror":
        return this.render(c.toggleMirror())
      case "counts":
        return this.render(c.toggleCounts())
      case "mode":
        return this.render(c.tapMode())
      case "finish":
        return this.render(c.finish())
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
      this.callCount(this.controller.view)
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
    // Only from ticks: a run's 5 waits until its seek has landed and the video is really there.
    this.callCount(this.controller.view)
  }

  private render(view: ViewState) {
    const panels = panelsFor(view)
    if (panels !== this.panels) {
      this.panels = panels
      this.videoWindow.setRect(panels.video!)
    }
    this.videoWindow.render(view)
    this.countIn.render(view)
    this.progress.render(view)
    this.segBar.render(view)
    this.banner.render(view)
    this.sections.render(view)
    this.controls.render(view)
    this.toast.render(view)
    this.skip.render(view)
    this.popup.render(view)
    this.saveSettings(view.settings)
    this.saveFirstLook(view.firstLookSeen)
    this.saveFinishReady(view.finishReady)
  }

  /** Saves that Finish routine has unlocked; it stays unlocked for the dance. */
  private saveFinishReady(ready: boolean) {
    if (ready === this.savedFinishReady) return
    this.savedFinishReady = ready
    global.persistentStorageSystem.store.putBool(finishReadyKey(TEST_DANCE.id), ready)
  }

  /** Writes speed, mirror and counts to persistent storage whenever they change. */
  private saveSettings(settings: Settings) {
    if (settings === this.savedSettings) return
    this.savedSettings = settings
    global.persistentStorageSystem.store.putString(SETTINGS_KEY, encodeSettings(settings))
  }

  /** Saves the "first look seen" flag once the first look has played or been skipped. */
  private saveFirstLook(seen: boolean) {
    if (seen === this.savedFirstLook) return
    this.savedFirstLook = seen
    print("DanceCoach: first look over; later opens go straight to Section 1")
    global.persistentStorageSystem.store.putBool(firstLookKey(TEST_DANCE.id), seen)
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
