/**
 * DanceCoach: the Lens entry point.
 *
 * Loads the dance package, runs the PlaybackController each frame from the video's time,
 * carries out its video requests and hands the view state to the view components.
 * All playback rules live in the controller; this file is only glue.
 */
import { BundledDanceSource } from "../Dance/BundledDanceSource"
import { LensTransport } from "../Dance/LensTransport"
import { DancePackage } from "./Core/DancePackage"
import { DancePicker } from "./Core/DancePicker"
import { DanceSource, LoadedDance } from "./Core/DanceSource"
import { ClipRequest, LookbackController, LookbackView, SideBySideView } from "./Core/LookbackController"
import { RemoteClip, RemoteDanceSource } from "./Core/RemoteDanceSource"
import { TakesClient } from "./Core/TakesClient"
import { AND_CALL, CountCaller } from "./Core/CountCaller"
import { PlaybackController, RoutineDoneChoice, SectionTap, Settings, VideoRequest, ViewState } from "./Core/PlaybackController"
import { PoseController, PoseView } from "./Core/PoseController"
import { decodeSettings, encodeSettings, finishReadyKey, firstLookKey, SETTINGS_KEY } from "./Core/SettingsStore"
import { ClipPlayer, VideoDriver } from "./Core/VideoDriver"
import { decodePlacement, encodePlacement, Placement, PLACEMENT_KEY } from "./Core/WindowPlacement"
import { Banner } from "./UI/Banner"
import { ControlBar, ControlCommand } from "./UI/ControlBar"
import { CountInPanel } from "./UI/CountInPanel"
import { DancePickerPanel } from "./UI/DancePickerPanel"
import { DancesButton } from "./UI/DancesButton"
import { panelsFor, PanelId, PLACEMENT, PxRect, SCREENS } from "./UI/Layout"
import { LookPanel } from "./UI/LookPanel"
import { PopupCard } from "./UI/PopupCard"
import { RecordCountdown } from "./UI/RecordCountdown"
import { RecordPopup } from "./UI/RecordPopup"
import { PoseBar, PoseBarCommand } from "./UI/PoseBar"
import { PoseLine } from "./UI/PoseLine"
import { ProgressBar } from "./UI/ProgressBar"
import { SectionRow } from "./UI/SectionRow"
import { SegBar } from "./UI/SegBar"
import { SideBySideBar } from "./UI/SideBySideBar"
import { SkipButton } from "./UI/SkipButton"
import { Toast } from "./UI/Toast"
import { VideoWindow } from "./UI/VideoWindow"
import { childObject } from "./UI/Visuals"
import { WindowGrab } from "./UI/WindowGrab"
import { WindowResize } from "./UI/WindowResize"

// The camera sits at the spawn point until tracking settles, so the window keeps
// re-placing itself in front of you for this long after the Lens starts.
const PLACE_SETTLE_SEC = 1.5
// The window's scale while a dance is being picked: too small to see, but not 0, which can break the maths on its transform.
const HIDDEN_SCALE = 0.0001
// Side by side's clip requests count up from their own seek counter, so they're offset out of the way of the playback controller's.
const SBS_SEEK_BASE = 1000000
// A take is one clip from 0, as long as it needs to be.
const TAKE_CLIP_END = 3600

@component
export class DanceCoach extends BaseScriptComponent {
  @input
  @hint("The camera the window is placed relative to")
  camera: SceneObject

  @input
  @hint("The window's root object; it's moved to the saved (or default) placement on start")
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

  @input
  @hint("The dance's Pose stills, cut by `npm run stills` (git-ignored), in any order. Without them, Pose can't open on the test dance.")
  poseStills: Texture[]

  // The spoken counts in Audio/Counts, made by scripts/makeCountVoice.ps1. One slot each
  // rather than an array, so tooling can assign them; with any missing, counts stay silent.
  @input
  @hint("The ingest server's address (https on the glasses), with no trailing path, e.g. https://dance.example. Dances are listed from it.")
  serverUrl: string = "http://localhost:8787"

  @input
  @allowUndefined
  @hint("The Internet Module asset: fetches the dance list and packages. Without it, the bundled test dance is offered.")
  internetModule: InternetModule

  @input
  @allowUndefined
  @hint("The Remote Media Module asset: turns downloaded clips into video textures.")
  remoteMediaModule: RemoteMediaModule

  @input @allowUndefined count1: AudioTrackAsset
  @input @allowUndefined count2: AudioTrackAsset
  @input @allowUndefined count3: AudioTrackAsset
  @input @allowUndefined count4: AudioTrackAsset
  @input @allowUndefined count5: AudioTrackAsset
  @input @allowUndefined count6: AudioTrackAsset
  @input @allowUndefined count7: AudioTrackAsset
  @input @allowUndefined count8: AudioTrackAsset
  @input @allowUndefined countAnd: AudioTrackAsset

  // Where the dance comes from; the Lens never imports a dance directly. The picker lists the
  // server's dances (or the bundled test dance, offline) and hands over the one chosen.
  private picker: DancePicker<Texture>
  private pickerPanel: DancePickerPanel
  private dancesButton: DancesButton
  // True from start until a dance has loaded, and again after "Dances": no dance is playing.
  private picking = true
  private windowShown = true
  private loaded: LoadedDance<Texture>
  private dance: DancePackage
  private controller: PlaybackController
  // Runs Pose while the controller's mode is Pose; poseView is null in Playthrough.
  private pose = new PoseController()
  private poseView: PoseView | null = null
  // Runs Lookback while the controller's mode is Lookback; lookbackView is null in the other modes.
  private lookback = new LookbackController()
  private lookbackView: LookbackView | null = null
  // The server's takes API; null without a server.
  private takesClient: TakesClient | null = null
  private pollingStatus = false
  // True while screen K is up: when it ends, the video goes back to the section's start.
  private recordingShown = false
  // Side by side (M): the take's window beside the original, its driver, and the takes downloaded so far (by dance and name).
  private takeWindow: VideoWindow
  private sbsBar: SideBySideBar
  private takeDriver: VideoDriver | null = null
  private takeDriverFor = ""
  private takeClips = new Map<string, RemoteClip<Texture>>()
  private sbsShown = false
  private caller = new CountCaller()
  private voice: AudioComponent | null = null
  // countTracks[n] says n, and countTracks[AND_CALL] says "and"; empty without the spoken counts.
  private countTracks: AudioTrackAsset[] = []
  private countIn: CountInPanel
  private progress: ProgressBar
  private poseLine: PoseLine
  private poseBar: PoseBar
  private lookPanel: LookPanel
  private recordCountdown: RecordCountdown
  private recordPopup: RecordPopup
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
  private resize: WindowResize
  // Where the window goes on start: the saved placement, or the default on first launch.
  private placement: Placement = PLACEMENT
  // Where you stood and faced (flat) when the window was placed; placements are saved relative to it.
  private originPos: vec3
  private originLook: vec3
  private originSet = false
  // Once you've dragged or resized the window it stays where you put it, instead of re-placing when a dance loads.
  private userMoved = false
  private savedSettings: Settings | null = null
  private savedFirstLook = false
  private savedFinishReady = false

  onAwake() {
    const onClipReady = () => this.videoWindow.fitVideo()
    const bundled = new BundledDanceSource(this.videoClips, onClipReady, this.poseStills)
    this.picker = new DancePicker(this.remoteSource(onClipReady), bundled)
    this.picker.onLoaded = (loaded) => this.beginDance(loaded)
    const saved = decodePlacement(global.persistentStorageSystem.store.getString(PLACEMENT_KEY))
    if (saved) this.placement = saved
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** The server's dances; without the network modules assigned, a source that can't be reached, so the bundled dance is offered. */
  private remoteSource(onClipReady: () => void): DanceSource<Texture> {
    if (this.internetModule && this.remoteMediaModule && this.serverUrl) {
      const transport = new LensTransport(this.internetModule, this.remoteMediaModule, onClipReady)
      const remote = new RemoteDanceSource(this.serverUrl, transport)
      this.takesClient = new TakesClient(this.serverUrl, transport)
      // Failures show in the picker only as "offline" or "couldn't load", so log why.
      const logged = <T>(what: string, p: Promise<T>) =>
        p.catch((err) => {
          print(`DanceCoach: ${what} failed: ${err && err.message ? err.message : err}`)
          throw err
        })
      return {
        list: () => logged(`listing dances from ${this.serverUrl}`, remote.list()),
        load: (name, onProgress) => logged(`loading ${name}`, remote.load(name, onProgress)),
      }
    }
    print("DanceCoach: Internet Module, Remote Media Module or Server Url isn't set; offering the bundled test dance")
    const unreachable = () => Promise.reject(new Error("No dance server is set up"))
    return { list: unreachable, load: unreachable }
  }

  /** A dance has loaded: set up its playback and show the window. */
  private beginDance(loaded: LoadedDance<Texture>) {
    this.loaded = loaded
    this.dance = loaded.dance
    print(`DanceCoach: playing ${this.dance.title}${loaded.clips ? "" : " (no clips; stand-in clock)"}`)
    const store = global.persistentStorageSystem.store
    const settings = decodeSettings(store.getString(SETTINGS_KEY))
    this.savedFirstLook = store.getBool(firstLookKey(this.dance.id))
    const firstLookSeen = this.savedFirstLook && !this.alwaysFirstLook
    if (this.savedFirstLook && !firstLookSeen) print("DanceCoach: playing the first look again (Always First Look is on)")
    this.savedFinishReady = store.getBool(finishReadyKey(this.dance.id))
    this.controller = new PlaybackController(this.dance, { settings, firstLookSeen, finishReady: this.savedFinishReady }, !!loaded.stills, !!loaded.fromServer)
    // Saved again only when the first look ends.
    this.savedFirstLook = firstLookSeen
    this.savedSettings = this.controller.view.settings
    this.poseView = null
    this.leaveLookback()
    this.takeClips.clear()
    this.caller = new CountCaller()
    this.fakeTime = 0
    this.fakeSeekId = -1
    const clips = loaded.clips
    this.driver = clips ? new VideoDriver(clips.players, (i) => this.videoWindow.setVideo(clips.textures[i])) : null
    if (!clips) print("DanceCoach: no video clips; using a stand-in clock")
    this.picking = false
    this.panels = null
    this.pickerPanel.render(null)
    this.showWindow(true)
    // The window was placed at boot, while tracking settled and a dance was being picked: place it again in front of where you're facing now.
    if (!this.userMoved) {
      this.placeLeft = PLACE_SETTLE_SEC
      this.originSet = false
    }
    this.render(this.controller.open())
  }

  /** Back to the list of dances: stops this dance, hides its panels and window, and lists again. */
  private leaveDance() {
    print("DanceCoach: back to the dance list")
    if (this.driver) this.driver.stop()
    this.driver = null
    this.poseView = null
    this.leaveLookback()
    if (this.voice && this.voice.isPlaying()) this.voice.stop(false)
    // Closes the count-in and the pop-up, which aren't on the window.
    this.render({ ...this.controller.view, countIn: null, popup: null })
    this.picking = true
    this.showWindow(false)
    this.picker.open()
  }

  /**
   * Shows or hides the window while picking. It's scaled to nothing rather than disabled: a window
   * that was disabled and enabled again stayed invisible on the glasses.
   */
  private showWindow(shown: boolean) {
    this.windowShown = shown
    const s = shown ? this.placement.scale : HIDDEN_SCALE
    this.windowRoot.getTransform().setLocalScale(new vec3(s, s, s))
  }

  private start() {
    this.placeWindow()
    // The other panels sit on the same plane as the video, so they share its parent.
    const plane = this.videoWindow.getSceneObject()
    // The count-in isn't on the window: it opens centred in front of you, like a pop-up.
    this.countIn = childObject("CountIn", this.getSceneObject()).createComponent(CountInPanel.getTypeName()) as CountInPanel
    this.countIn.setup(this.camera, this.videoWindow)
    this.progress = childObject("Progress", plane).createComponent(ProgressBar.getTypeName()) as ProgressBar
    this.poseLine = childObject("PoseLine", plane).createComponent(PoseLine.getTypeName()) as PoseLine
    this.poseBar = childObject("PoseBar", plane).createComponent(PoseBar.getTypeName()) as PoseBar
    this.poseBar.onPress = (command) => this.pressPoseBar(command)
    // The still follows the drag at once; the count is said once, on the frame after it lets go.
    this.poseBar.onScrub = (fraction) => {
      if (!this.poseView) return
      this.poseView = this.pose.scrub(fraction)
      this.render(this.controller.view)
    }
    this.poseBar.onScrubEnd = () => {
      if (!this.poseView) return
      this.poseView = this.pose.scrubEnd()
      this.render(this.controller.view)
    }
    this.lookPanel = childObject("LookPanel", plane).createComponent(LookPanel.getTypeName()) as LookPanel
    this.lookPanel.onSelect = (attempt) => {
      if (!this.lookbackView) return
      this.lookbackView = this.lookback.selectAttempt(attempt)
      this.render(this.controller.view)
    }
    this.lookPanel.onRecord = () => this.tapRecord()
    this.lookPanel.onPlay = () => this.playSideBySide()
    // The take's window is a second video window beside the original, on the same plane; only screen M shows it.
    this.takeWindow = childObject("TakeWindow", plane).createComponent(VideoWindow.getTypeName()) as VideoWindow
    this.takeWindow.getSceneObject().enabled = false
    this.sbsBar = childObject("SideBySideBar", plane).createComponent(SideBySideBar.getTypeName()) as SideBySideBar
    this.sbsBar.onPlay = () => {
      this.lookbackView = this.lookback.togglePlay()
      this.render(this.controller.view)
    }
    // The count follows the drag at once; both videos seek once it lets go.
    this.sbsBar.onScrub = (fraction) => {
      this.lookbackView = this.lookback.scrub(fraction)
      this.render(this.controller.view)
    }
    this.sbsBar.onScrubEnd = () => {
      this.lookbackView = this.lookback.scrubEnd()
      this.render(this.controller.view)
    }
    this.recordCountdown = childObject("RecordCountdown", plane).createComponent(RecordCountdown.getTypeName()) as RecordCountdown
    this.recordPopup = childObject("RecordPopup", this.getSceneObject()).createComponent(RecordPopup.getTypeName()) as RecordPopup
    this.recordPopup.setup(this.camera)
    this.recordPopup.onYes = () => this.confirmRecord()
    this.recordPopup.onNo = () => {
      this.lookbackView = this.lookback.cancel()
      this.render(this.controller.view)
    }
    this.segBar = childObject("SegBar", plane).createComponent(SegBar.getTypeName()) as SegBar
    this.banner = childObject("Banner", plane).createComponent(Banner.getTypeName()) as Banner
    this.sections = childObject("Sections", plane).createComponent(SectionRow.getTypeName()) as SectionRow
    this.sections.onTap = (id) => this.tapSection(id)
    this.sections.onRange = (first, last) => this.render(this.controller.tapRange(first, last))
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
    // Drag the video to move the window. The video's smallest rect (Clip ended) is inside
    // it on every screen, so the grab area never covers a button.
    const grab = childObject("Grab", plane).createComponent(WindowGrab.getTypeName()) as WindowGrab
    grab.setup(this.windowRoot, SCREENS.C.video)
    grab.onMoving = () => {
      this.userMoved = true
      this.stopPlacing()
      this.faceCamera()
    }
    grab.onMoved = () => {
      this.faceCamera()
      this.savePlacement()
    }
    // Pinch a top corner of the video to resize the window.
    this.resize = childObject("Resize", plane).createComponent(WindowResize.getTypeName()) as WindowResize
    this.resize.setup(this.windowRoot)
    this.resize.onResizing = () => {
      this.userMoved = true
      this.stopPlacing()
    }
    this.resize.onResized = () => this.savePlacement()
    this.dancesButton = childObject("Dances", plane).createComponent(DancesButton.getTypeName()) as DancesButton
    this.dancesButton.onPress = () => this.leaveDance()
    // The dance picker comes first; the window shows once a dance has loaded.
    this.pickerPanel = childObject("DancePicker", this.getSceneObject()).createComponent(DancePickerPanel.getTypeName()) as DancePickerPanel
    this.pickerPanel.setup(this.camera)
    this.pickerPanel.onPick = (id) => this.picker.pick(id)
    this.pickerPanel.onRetry = () => this.picker.retry()
    this.pickerPanel.onList = () => this.picker.back()
    this.setupVoice()
    this.showWindow(false)
    this.picker.open()
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
    if (this.countAnd) this.countTracks[AND_CALL] = this.countAnd
    else print(`DanceCoach: Count And isn't assigned; the "&" steps in Pose stay silent`)
    this.voice = this.getSceneObject().createComponent("Component.AudioComponent") as AudioComponent
    // The word has to land on the beat.
    this.voice.playbackMode = Audio.PlaybackMode.LowLatency
  }

  /** Says the count when a new one starts; a new word cuts off the one before. */
  private callCount(view: ViewState) {
    this.say(this.caller.next(view))
  }

  /** Says a number (1–8) or "and" (AND_CALL); 0 is nothing. */
  private say(n: number) {
    if (n === 0 || !this.voice || !this.countTracks[n]) return
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
        return this.switchMode(c.tapMode())
      case "speedCycle":
        this.lookbackView = this.lookback.cycleSpeed()
        return this.render(c.view)
      case "recordAgain":
        return this.tapRecord(true)
      case "backToTakes":
        this.lookbackView = this.lookback.backToTakes()
        return this.render(c.view)
      case "finish":
        return this.render(c.finish())
      default:
        return this.render(c.setSpeed(command))
    }
  }

  /** A Pose bar button: any use keeps the bar open a while longer. */
  private pressPoseBar(command: PoseBarCommand) {
    if (!this.poseView) return
    this.poseView = this.pose.use()
    switch (command) {
      case "mode":
        return this.switchMode(this.controller.tapMode(this.poseView.section))
      case "mirror":
        return this.render(this.controller.toggleMirror())
      case "halfCounts":
        this.poseView = this.pose.setHalfCounts(this.controller.toggleHalfCounts().settings.halfCounts)
        return this.render(this.controller.view)
      case "back":
      case "forward":
        this.poseView = command === "back" ? this.pose.stepBack() : this.pose.stepForward()
        // The still changes at once; the count is said once, on the next frame.
        return this.render(this.controller.view)
      case "playFromHere":
        print(`DanceCoach: Play from here, Section ${this.poseView.section} step ${this.poseView.step}`)
        return this.switchMode(this.controller.playFromHere(this.poseView.section, this.poseView.step))
    }
  }

  /** After the mode button: enters the Pose or Lookback controller when the mode becomes theirs, and leaves it when the mode moves on. */
  private switchMode(view: ViewState) {
    if (view.mode === "Pose" && !this.poseView) {
      print(`DanceCoach: Pose on Section ${view.section}`)
      this.poseView = this.pose.enter(view.section, view.sectionCount, view.settings.halfCounts)
    } else if (view.mode !== "Pose" && this.poseView) {
      print(`DanceCoach: back to Playthrough on Section ${view.section}`)
      this.poseView = null
    }
    if (view.mode === "Lookback" && !this.lookbackView) this.enterLookback(view)
    else if (view.mode !== "Lookback" && this.lookbackView) this.leaveLookback()
    this.render(view)
  }

  /** Opens Lookback on the section, then lists its takes; the screen is I until they arrive, and L if there are any. */
  private enterLookback(view: ViewState) {
    print(`DanceCoach: Lookback on Section ${view.section}`)
    this.lookbackView = this.lookback.enter(view.section)
    this.listTakes(view.section)
  }

  /** Lists the section's takes afresh (so takes deleted on the phone are gone) and shows them; a failure says the server can't be reached. */
  private listTakes(section: number) {
    const client = this.takesClient
    if (!client) return
    const dance = this.dance
    client.list(dance.id, section).then(
      (takes) => {
        // Ignore a listing that lands after Lookback was left, reopened on another section, or the dance was swapped.
        if (!this.lookbackView || this.lookbackView.section !== section || this.dance !== dance) return
        this.forgetTakeClips(dance.id, section, takes.map((t) => t.name))
        this.lookbackView = this.lookback.setTakes(takes)
        this.render(this.controller.view)
      },
      (err) => {
        print(`DanceCoach: listing takes failed: ${err && err.message ? err.message : err}`)
        if (!this.lookbackView || this.lookbackView.section !== section || this.dance !== dance) return
        this.lookbackView = this.lookback.serverUnreachable()
        this.render(this.controller.view)
      },
    )
  }

  /** Drops the downloaded videos of the section's takes that are no longer listed (deleted on the phone). */
  private forgetTakeClips(danceId: string, section: number, keep: string[]) {
    const prefix = `${danceId}/s${section}-t`
    for (const key of [...this.takeClips.keys()]) {
      if (key.startsWith(prefix) && !keep.includes(key.slice(danceId.length + 1))) this.takeClips.delete(key)
    }
  }

  private leaveLookback() {
    this.lookback.leave()
    this.lookbackView = null
    this.stopTakeDriver()
  }

  /** The + or Record lookback (or Record again, on M): asks "Record lookback?" about a take of this section at the current speed and mirror. */
  private tapRecord(again = false) {
    if (!this.lookbackView) return
    const c = this.controller
    const v = c.view
    const range = { start: c.clock.sectionStart(v.section), end: c.clock.sectionEnd(v.section) }
    this.lookbackView = again ? this.lookback.recordAgain(v.settings.speed, v.settings.mirror, range) : this.lookback.tapRecord(v.settings.speed, v.settings.mirror, range)
    this.render(v)
  }

  /** Play side by side: the take's video is fetched if it hasn't been, then M opens. */
  private playSideBySide() {
    if (!this.lookbackView) return
    const c = this.controller
    const v = c.view
    this.lookbackView = this.lookback.playSideBySide({ start: c.clock.sectionStart(v.section), end: c.clock.sectionEnd(v.section), beatSec: c.clock.beatSec })
    this.carryOutRequests()
    this.render(v)
  }

  /** "Yes, record": arms the take, and the 3, 2, 1 starts once the server has. */
  private confirmRecord() {
    if (!this.lookbackView) return
    this.lookbackView = this.lookback.confirm()
    this.carryOutRequests()
    this.render(this.controller.view)
  }

  /** Does what the Lookback controller has asked of the server, and tells it how each went. */
  private carryOutRequests() {
    const client = this.takesClient
    const dance = this.dance
    const why = (err: any) => (err && err.message ? err.message : String(err))
    for (const req of this.lookback.takeRequests()) {
      if (!client) {
        this.lookbackView = this.lookback.requestFailed("No dance server is set up")
        return
      }
      print(`DanceCoach: take: ${req.type}`)
      switch (req.type) {
        case "arm":
          client.arm(dance.id, req.params).then(
            (id) => (this.lookbackView = this.lookback.armed(id)),
            (err) => {
              print(`DanceCoach: arming the take failed: ${why(err)}`)
              this.lookbackView = this.lookback.armFailed(`Couldn't start the take: ${why(err)}`)
            },
          )
          break
        case "start":
        case "stop":
          client[req.type](req.sessionId).catch((err) => {
            print(`DanceCoach: ${req.type} of the take failed: ${why(err)}`)
            this.lookbackView = this.lookback.requestFailed(`Couldn't ${req.type} the take: ${why(err)}`)
          })
          break
        case "download":
          client.loadTake(dance.id, req.take).then(
            (clip) => {
              // Kept, so playing it side by side doesn't download it again.
              this.takeClips.set(this.takeKey(req.take.name), clip as RemoteClip<Texture>)
              this.lookbackView = this.lookback.downloaded(req.take)
            },
            (err) => {
              print(`DanceCoach: downloading the take failed: ${why(err)}`)
              this.lookbackView = this.lookback.downloadFailed(`Couldn't download the take: ${why(err)}`)
            },
          )
          break
        case "load":
          if (this.takeClips.has(this.takeKey(req.take.name))) {
            this.lookbackView = this.lookback.takeLoaded(req.take)
            break
          }
          client.loadTake(dance.id, req.take).then(
            (clip) => {
              this.takeClips.set(this.takeKey(req.take.name), clip as RemoteClip<Texture>)
              this.lookbackView = this.lookback.takeLoaded(req.take)
            },
            (err) => {
              print(`DanceCoach: loading the take failed: ${why(err)}`)
              this.lookbackView = this.lookback.takeLoadFailed(`Couldn't load the take: ${why(err)}`)
              // It may have been deleted on the phone: list again so it goes.
              if (this.lookbackView) this.listTakes(this.lookbackView.section)
            },
          )
          break
      }
    }
  }

  /** What the video should do: Lookback plays the section itself while a take is recording; otherwise the controller's request. */
  private videoRequest(): VideoRequest {
    const video = this.controller.view.video
    const sbs = this.sideBySide()
    if (sbs) return this.clipRequest(sbs.originalClip, this.controller.clock.sectionEnd(this.lookbackView!.section), SBS_SEEK_BASE)
    const record = this.lookbackView ? this.lookbackView.record : null
    return record && record.phase === "recording" ? { ...video, playing: true, rate: record.speed, holdFrame: false, dim: false } : video
  }

  /** Side by side's view while screen M is up, else null. */
  private sideBySide(): SideBySideView | null {
    return this.lookbackView && this.lookbackView.screen === "M" ? this.lookbackView.sideBySide : null
  }

  private clipRequest(clip: ClipRequest, runEnd: number, seekBase: number): VideoRequest {
    return { seekTo: clip.seekTo, seekId: seekBase + clip.seekId, runEnd, playing: clip.playing, rate: clip.rate, holdFrame: false, dim: false }
  }

  private takeKey(name: string): string {
    return `${this.dance.id}/${name}`
  }

  /** The driver for the take on M: made when M opens on it, from the take's downloaded clip. Null if it isn't there. */
  private ensureTakeDriver(sbs: SideBySideView): VideoDriver | null {
    const key = this.takeKey(sbs.take.name)
    if (this.takeDriver && this.takeDriverFor === key) return this.takeDriver
    this.stopTakeDriver()
    const clip = this.takeClips.get(key)
    if (!clip) return null
    this.takeDriverFor = key
    this.takeWindow.setVideo(clip.texture)
    this.takeDriver = new VideoDriver([{ clip: { id: sbs.take.name, start: 0, end: TAKE_CLIP_END }, player: clip.player }], () => this.takeWindow.setVideo(clip.texture))
    return this.takeDriver
  }

  private stopTakeDriver() {
    if (this.takeDriver) this.takeDriver.stop()
    this.takeDriver = null
    this.takeDriverFor = ""
  }

  /** The playback view with Lookback's screen over it: I or L, J dimmed, or K with the recording's progress. */
  private lookbackOver(playView: ViewState, look: LookbackView): ViewState {
    if (look.screen === "J") return { ...playView, screen: "J", video: { ...playView.video, dim: true } }
    if (look.screen === "M" && look.sideBySide) return { ...playView, screen: "M", countIn: null, count: look.sideBySide.count, and: false, video: { ...playView.video, dim: false } }
    if (look.screen === "K" && look.record) return { ...playView, screen: "K", countIn: null, runProgress: look.record.progress, video: { ...playView.video, dim: false } }
    return { ...playView, screen: look.screen }
  }

  /** Asks the server whether the phone camera is connected; one request at a time. */
  private pollStatus() {
    const client = this.takesClient
    if (!client || this.pollingStatus) return
    this.pollingStatus = true
    client.status().then(
      (status) => {
        this.pollingStatus = false
        if (!this.lookbackView) return
        this.lookbackView = this.lookback.recorderStatus(status)
        this.carryOutRequests()
      },
      (err) => {
        this.pollingStatus = false
        if (this.lookbackView) this.lookbackView = this.lookback.serverUnreachable()
        print(`DanceCoach: recorder status failed: ${err && err.message ? err.message : err}`)
      },
    )
  }

  private update() {
    const dt = getDeltaTime()
    if (this.placeLeft > 0) {
      this.placeLeft -= dt
      this.placeWindow()
      if (this.placeLeft <= 0) this.stopPlacing()
    }
    if (this.picking) {
      this.picker.tick(dt)
      this.pickerPanel.render(this.picker.view)
      return
    }
    // Video requests are carried out once a frame, here; a command's request lands on the next frame.
    const view = this.controller.view
    if (!this.driver) {
      this.applyFakeVideo(this.videoRequest(), dt)
      this.advance(this.fakeTime, dt)
      return
    }
    // Until a seek has landed, the video's time isn't the run's time yet.
    const wasBusy = this.driver.busy
    this.driver.apply(this.videoRequest(), dt)
    // On M the take's video is driven the same way, and the two play only once both have landed.
    const sbs = this.sideBySide()
    const takeDriver = sbs ? this.ensureTakeDriver(sbs) : null
    if (sbs && takeDriver) takeDriver.apply(this.clipRequest(sbs.takeClip, TAKE_CLIP_END, 0), dt)
    if (this.driver.busy || (takeDriver && takeDriver.busy)) {
      this.render(view)
      return
    }
    if (sbs && sbs.seeking && takeDriver) this.lookbackView = this.lookback.landed()
    // The video's aspect is known once a seek has landed, whether or not onPlaybackReady fired.
    if (wasBusy) this.videoWindow.fitVideo()
    this.advance(this.driver.time, dt)
  }

  /** One frame on from the video's time: the Pose controller ticks in Pose, the playback controller otherwise. */
  private advance(videoTimeSec: number, dt: number) {
    if (this.lookback.tick(dt, videoTimeSec)) this.pollStatus()
    if (this.lookbackView) {
      this.lookbackView = this.lookback.view
      this.carryOutRequests()
    }
    if (this.poseView) {
      // The video only holds the section's start frame; Pose moves on real time.
      if (this.poseLine.aimed || this.poseBar.aimed) this.pose.aim()
      this.poseView = this.pose.tick(dt)
      this.render(this.controller.view)
      this.say(this.caller.nextStep(this.poseView))
      return
    }
    this.render(this.controller.tick(videoTimeSec, dt))
    // Only from ticks: a run's 5 waits until its seek has landed and the video is really there.
    this.callCount(this.controller.view)
  }

  /** In Pose the window shows the step's still instead of the video; in Playthrough, the video. */
  private showStill() {
    const pose = this.poseView
    const stills = this.loaded ? this.loaded.stills : null
    this.videoWindow.setStill(pose && stills && stills[pose.section - 1] ? stills[pose.section - 1][pose.step] ?? null : null)
  }

  private render(playView: ViewState) {
    // Once a recording's screen K is over (saved, or failed), the video goes back, paused, to the section's start.
    const recording = !!this.lookbackView && this.lookbackView.screen === "K"
    if (this.recordingShown && !recording) playView = this.controller.restartLookback()
    this.recordingShown = recording
    // Likewise when side by side is left (Back to takes, Record again or the mode button): the take stops, and the original goes back to the section's start.
    const onSbs = !!this.lookbackView && this.lookbackView.screen === "M"
    if (this.sbsShown && !onSbs) {
      this.stopTakeDriver()
      playView = this.controller.restartLookback()
    }
    this.sbsShown = onSbs
    // In Pose the Pose controller says which screen is up: D, or E with the bar open. In Lookback, the Lookback controller: I, L, J or K.
    const view = this.poseView ? { ...playView, screen: this.poseView.screen } : this.lookbackView ? this.lookbackOver(playView, this.lookbackView) : playView
    const panels = panelsFor(view)
    if (panels !== this.panels) {
      this.panels = panels
      this.videoWindow.setRect(panels.video!)
      this.resize.setRect(panels.video!)
      this.takeWindow.getSceneObject().enabled = !!panels.take
      if (panels.take) this.takeWindow.setRect(panels.take)
    }
    this.showStill()
    this.videoWindow.render(view, this.poseView, this.lookbackView)
    if (panels.take) this.takeWindow.render(view, null, this.lookbackView)
    this.sbsBar.render(view, this.lookbackView)
    this.poseLine.render(view, this.poseView)
    this.poseBar.render(view, this.poseView)
    this.lookPanel.render(view, this.lookbackView)
    this.recordCountdown.render(view, this.lookbackView)
    this.recordPopup.render(this.lookbackView)
    this.resize.render(view)
    this.countIn.render(view)
    this.progress.render(view)
    this.segBar.render(view)
    this.banner.render(view)
    this.sections.render(view)
    this.controls.render(view, this.lookbackView)
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
    global.persistentStorageSystem.store.putBool(finishReadyKey(this.dance.id), ready)
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
    global.persistentStorageSystem.store.putBool(firstLookKey(this.dance.id), seen)
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

  /** Puts the window at its placement: ahead, to the right and a little below eye level, at its size. */
  private placeWindow() {
    const p = this.placement
    const yaw = quat.angleAxis((-p.yawRightDeg * Math.PI) / 180, vec3.up())
    const dir = yaw.multiplyVec3(this.lookFlat())
    const pos = this.camera.getTransform().getWorldPosition().add(dir.uniformScale(p.distanceCm)).add(new vec3(0, -p.dropCm, 0))
    this.windowRoot.getTransform().setWorldPosition(pos)
    // Still scaled to nothing while a dance is being picked.
    const s = this.windowShown ? p.scale : HIDDEN_SCALE
    this.windowRoot.getTransform().setLocalScale(new vec3(s, s, s))
    this.faceCamera()
  }

  /** Stops re-placing the window and remembers where you are now, as the origin placements are saved against. */
  private stopPlacing() {
    this.placeLeft = 0
    if (this.originSet) return
    this.originSet = true
    this.originPos = this.camera.getTransform().getWorldPosition()
    this.originLook = this.lookFlat()
  }

  /** Turns the window (about the vertical only) to face you. */
  private faceCamera() {
    const dir = this.toWindowFlat()
    this.windowRoot.getTransform().setWorldRotation(quat.angleAxis(Math.atan2(-dir.x, -dir.z), vec3.up()))
  }

  /**
   * Saves where the window is and how big, relative to where you stood when it was placed (not where you
   * are now, so walking up to the window to grab it doesn't save it as close). Restored on the next start.
   */
  private savePlacement() {
    const root = this.windowRoot.getTransform()
    const d = root.getWorldPosition().sub(this.originPos)
    const flat = new vec3(d.x, 0, d.z)
    const dir = flat.normalize()
    const look = this.originLook
    this.placement = {
      distanceCm: Math.round(flat.length),
      yawRightDeg: Math.round((-Math.atan2(look.cross(dir).y, look.dot(dir)) * 180) / Math.PI),
      dropCm: Math.round(-d.y),
      scale: Math.round(root.getLocalScale().x * 100) / 100,
    }
    global.persistentStorageSystem.store.putString(PLACEMENT_KEY, encodePlacement(this.placement))
    const p = this.placement
    print(`DanceCoach placement saved: { distanceCm: ${p.distanceCm}, yawRightDeg: ${p.yawRightDeg}, dropCm: ${p.dropCm}, scale: ${p.scale} }`)
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
