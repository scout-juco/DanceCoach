/**
 * The phone as the recorder, while P5 shows: opens the camera (no preview), watches the server for an armed take,
 * films it and uploads it. Moved here from the old recorder page (record.ts); the logic is the same, with its
 * browser parts behind `RecorderDeps` so Vitest can run it.
 */

export interface RecorderSession { id: string; danceId: string; state: string }
export interface Beat { session: RecorderSession | null; serverTime?: number }
export type UploadResult = { ok: true } | { ok: false; error: string }

/** One recording: a MediaRecorder in the browser. */
export interface Engine {
  start(): void
  stop(): void
  readonly active: boolean
  readonly mimeType: string
}

export interface RecorderDeps {
  beat(): Promise<Beat>
  openCamera(): Promise<unknown>
  closeCamera(stream: unknown): void
  makeEngine(stream: unknown, onData: (blob: Blob) => void, onStop: () => void): Engine
  upload(sid: string, body: Blob, startedAt: number): Promise<UploadResult>
  /** Resolves to a function that gives the screen back to the phone's own timer. */
  keepAwake(): Promise<() => void>
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(id: unknown): void
}

export type CameraState = "closed" | "open" | "blocked" | "missing"

export interface RecorderStatus {
  camera: CameraState
  recording: boolean
  uploading: boolean
  message: string
  isError: boolean
}

export const POLL_MS = 300
/** Keeps filming this long after the Specs stop (the server's RECORD_TAIL_SEC), so the take's end isn't cut short. */
export const TAIL_MS = 1000

export const NO_CAMERA_API = "This page can't open the camera because it isn't on a secure (https) address. Open it from the https address your Specs use, then reload."
export const ARMED_WITHOUT_CAMERA = "A take is armed but the camera isn't open. Fix the camera, then record again."

/** Why the camera can't open, as the dancer should read it. */
export function cameraProblem(err: unknown): string {
  const name = (err as { name?: string } | null)?.name
  if (name === "NotAllowedError") return "The camera is blocked. Allow camera and microphone for this page in the browser's settings, then reload."
  if (name === "NotFoundError") return "This phone has no camera the page can use."
  return `The camera won't open (${err instanceof Error ? err.message : String(err)}).`
}

interface Filming {
  sid: string
  engine: Engine
  chunks: Blob[]
  discard: boolean
  /** When the recorder began, in the server's time: what the server lines the take up from. */
  startedAt: number
}

export class TakeRecorder {
  status: RecorderStatus = { camera: "closed", recording: false, uploading: false, message: "", isError: false }
  private stream: unknown = null
  private filming: Filming | null = null
  private clockOffset = 0
  private timer: unknown = null
  private polling = false
  private running = false
  private release: (() => void) | null = null

  constructor(
    private deps: RecorderDeps,
    /** Called whenever the status changes. */
    private onChange: (s: RecorderStatus) => void = () => {},
    /** Called after a take was uploaded and saved. */
    private onSaved: () => void = () => {},
  ) {}

  /** Opens the camera, takes the wake lock and starts watching for an armed take. */
  async start() {
    this.running = true
    this.schedule()
    await this.openCamera()
  }

  /** Leaves P5: a take being filmed is dropped (the Specs find out when the phone goes quiet), the camera and screen are given back. */
  stop() {
    this.running = false
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = null
    this.stopFilming(true)
    this.closeCamera()
    this.release?.()
    this.release = null
  }

  /** The browser drops the wake lock when the page is hidden; take it again on return. */
  async wake() {
    if (!this.running || !this.stream) return
    try {
      this.release = await this.deps.keepAwake()
    } catch {
      this.release = null // refused (battery saver): the screen may sleep, nothing else breaks
    }
  }

  private set(patch: Partial<RecorderStatus>) {
    this.status = { ...this.status, ...patch }
    this.onChange(this.status)
  }

  private async openCamera() {
    try {
      const stream = await this.deps.openCamera()
      if (!this.running) return this.deps.closeCamera(stream)
      this.stream = stream
      this.set({ camera: "open", message: "", isError: false })
      void this.wake()
    } catch (err) {
      if (!this.running) return
      const missing = (err as { name?: string } | null)?.name === "NoCameraApi"
      this.set({ camera: missing ? "missing" : "blocked", message: missing ? NO_CAMERA_API : cameraProblem(err), isError: true })
    }
  }

  private closeCamera() {
    if (this.stream) this.deps.closeCamera(this.stream)
    this.stream = null
    this.set({ camera: "closed" })
  }

  private schedule() {
    if (this.running) this.timer = this.deps.setTimer(() => void this.tick(), POLL_MS)
  }

  /** One look at the server: starts filming an armed take, or sends what was filmed once the Specs have stopped. */
  async tick() {
    this.timer = null
    if (!this.running || this.polling) return this.schedule()
    this.polling = true
    try {
      const sent = this.deps.now()
      const { session, serverTime } = await this.deps.beat()
      if (typeof serverTime === "number") this.clockOffset = serverTime - (sent + this.deps.now()) / 2
      const active = session && (session.state === "armed" || session.state === "recording") ? session : null
      if (active && !this.status.uploading) {
        if (this.filming && this.filming.sid !== active.id) this.stopFilming(true)
        if (!this.filming) {
          if (this.stream) this.startFilming(active)
          else this.set({ message: ARMED_WITHOUT_CAMERA, isError: true })
        }
      } else if (this.filming) {
        this.stopFilming(false)
      }
    } catch {
      // The server is out of reach for a moment; the next look tries again.
    } finally {
      this.polling = false
      this.schedule()
    }
  }

  private startFilming(session: RecorderSession) {
    const chunks: Blob[] = []
    const current: Filming = { sid: session.id, engine: undefined as unknown as Engine, chunks, discard: false, startedAt: 0 }
    current.engine = this.deps.makeEngine(
      this.stream,
      (blob) => blob.size && chunks.push(blob),
      () => {
        if (!current.discard) void this.upload(current)
      },
    )
    current.engine.start()
    // The recording's first frame is when start() was called, in the server's time.
    current.startedAt = this.deps.now() + this.clockOffset
    this.filming = current
    this.set({ recording: true, message: "", isError: false })
  }

  private stopFilming(discard: boolean) {
    const current = this.filming
    if (!current) return
    this.filming = null
    current.discard = discard
    this.set({ recording: false })
    const stop = () => current.engine.active && current.engine.stop()
    if (discard) stop()
    else this.deps.setTimer(stop, TAIL_MS)
  }

  private async upload(current: Filming) {
    const blob = new Blob(current.chunks, { type: current.engine.mimeType })
    this.set({ uploading: true })
    let result: UploadResult
    try {
      result = await this.deps.upload(current.sid, blob, current.startedAt)
    } catch {
      result = { ok: false, error: "The recording didn't reach the server. Check the connection and record again." }
    }
    this.set({ uploading: false, message: result.ok ? "Take saved." : result.error, isError: !result.ok })
    if (result.ok) this.onSaved()
  }
}

/** The real thing: getUserMedia, MediaRecorder, the wake lock, fetch and XHR. */
export function browserDeps(token: string): RecorderDeps {
  return {
    beat: async () => {
      const res = await fetch("/link/phone/beat", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      return { session: body.session ?? null, serverTime: body.serverTime }
    },
    openCamera: async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no camera api"), { name: "NoCameraApi" })
      // Audio processing is off: the server lines the take up by hearing the music, not a cleaned-up voice.
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    },
    closeCamera: (stream) => (stream as MediaStream).getTracks().forEach((t) => t.stop()),
    makeEngine: (stream, onData, onStop) => {
      const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m))
      const recorder = new MediaRecorder(stream as MediaStream, mime ? { mimeType: mime } : {})
      recorder.ondataavailable = (e) => onData(e.data)
      recorder.onstop = onStop
      return {
        start: () => recorder.start(1000),
        stop: () => recorder.stop(),
        get active() {
          return recorder.state !== "inactive"
        },
        get mimeType() {
          return recorder.mimeType
        },
      }
    },
    upload: (sid, body, startedAt) =>
      new Promise((done) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `/takes/session/${sid}/upload`)
        xhr.setRequestHeader("Content-Type", body.type || "video/mp4")
        xhr.setRequestHeader("X-Recording-Started", String(startedAt))
        xhr.onload = () => {
          if (xhr.status === 200) return done({ ok: true })
          let error = "The take didn't save. Record again."
          try {
            error = JSON.parse(xhr.responseText).error ?? error
          } catch {}
          done({ ok: false, error })
        }
        xhr.onerror = () => done({ ok: false, error: "The recording didn't reach the server. Check the connection and record again." })
        xhr.send(body)
      }),
    keepAwake: async () => {
      const lock = await (navigator as any).wakeLock?.request("screen")
      return () => void lock?.release()
    },
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as number),
  }
}
