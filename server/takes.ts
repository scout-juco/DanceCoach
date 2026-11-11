/**
 * Takes: a dancer's filmed attempts at one section (Lookback).
 *
 * The glasses arm a take for a dance and section, tell the server when the section starts and stops
 * playing, and the phone uploads what it filmed. The server lines the upload up with the section, trims
 * it to the section's length at the recorded speed, and transcodes it to H.264 mp4 with no audio at the
 * clip size, into <storage>/<id>/takes/, indexed by takes.json.
 *
 * Alignment is music-start detection (the first sustained loud audio after silence: the phone's mic
 * hears the glasses start the clip), chosen by the M4-01 spike over cross-correlation, which failed at
 * 0.75×. If no music is heard, the server's own clock stands in: the take ends when the glasses said stop.
 */
import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { CountClock } from "../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { DancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { SCALE_FILTER } from "../scripts/cutClips"
import { SAMPLE_RATE } from "./detectBeats"
import { decodeAudio, probeVideo, UploadError } from "./media"

const run = promisify(execFile)

/** The phone is connected when it polled /recorder/state this recently. */
export const PHONE_TIMEOUT_MS = 3000
/** How long after stop the phone has to send its recording. */
export const UPLOAD_TIMEOUT_MS = 60_000
const TAKE_FPS = 30
const MIN_SPEED = 0.25
const MAX_SPEED = 2

export class NotFoundError extends Error {}

export interface Take {
  /** The file name without .mp4, e.g. s2-t3. */
  name: string
  section: number
  speed: number
  mirror: boolean
  created: string
  /** Seconds into the raw recording where count 1 was; the take starts there. */
  offset: number
  /** Per section, counting up from 1; never reused after a delete. */
  number: number
}

export type SessionState = "armed" | "recording" | "uploading" | "processing" | "ready" | "failed"

export interface SessionView {
  id: string
  danceId: string
  section: number
  speed: number
  mirror: boolean
  state: SessionState
  take?: Take
  reason?: string
}

interface Session extends SessionView {
  startedAt?: number
  stoppedAt?: number
}

/**
 * Seconds into the audio where music starts: the first moment of a loud stretch, loud being a fifth of
 * the way from the room's noise to the music's level. Null if it never gets loud.
 */
export function findMusicStart(samples: Float32Array, rate: number): number | null {
  const win = Math.round(rate / 100)
  const rms: number[] = []
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j]
    rms.push(Math.sqrt(sum / win))
  }
  if (rms.length === 0) return null
  const sorted = [...rms].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.05)]
  const peak = sorted[Math.floor(sorted.length * 0.95)]
  if (peak < 0.003 || peak < floor * 3) return null
  const loud = floor + 0.2 * (peak - floor)
  // Sustained: most of the next 200 ms is loud too, so a bump or a click isn't taken for the music.
  const ahead = 20
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] <= loud) continue
    const next = rms.slice(i, i + ahead)
    if (next.filter((v) => v > loud).length >= next.length * 0.7) return i / 100
  }
  return null
}

export const takesDir = (storageDir: string, id: string) => join(storageDir, id, "takes")

export async function readTakes(storageDir: string, id: string): Promise<Take[]> {
  try {
    return JSON.parse(await readFile(join(takesDir(storageDir, id), "takes.json"), "utf8"))
  } catch {
    return []
  }
}

async function writeTakes(storageDir: string, id: string, takes: Take[]) {
  const file = join(takesDir(storageDir, id), "takes.json")
  await writeFile(`${file}.tmp`, JSON.stringify(takes, null, 2))
  await rename(`${file}.tmp`, file)
}

export async function deleteTake(storageDir: string, id: string, name: string) {
  const takes = await readTakes(storageDir, id)
  if (!takes.some((t) => t.name === name)) throw new NotFoundError("There's no such take.")
  await rm(join(takesDir(storageDir, id), `${name}.mp4`), { force: true })
  await writeTakes(storageDir, id, takes.filter((t) => t.name !== name))
}

/** The take's file, if it is listed and still on disk. */
export async function takeFile(storageDir: string, id: string, name: string): Promise<string | null> {
  if (!(await readTakes(storageDir, id)).some((t) => t.name === name)) return null
  const file = join(takesDir(storageDir, id), `${name}.mp4`)
  return (await stat(file).then(() => true, () => false)) ? file : null
}

export interface RecorderOptions {
  storageDir: string
  now?: () => number
  uploadTimeoutMs?: number
}

/** The one armed take at a time, and the phone's heartbeat. */
export class Recorder {
  private session: Session | null = null
  private lastBeat = -Infinity
  private readonly now: () => number
  private readonly uploadTimeoutMs: number

  constructor(private readonly options: RecorderOptions) {
    this.now = options.now ?? Date.now
    this.uploadTimeoutMs = options.uploadTimeoutMs ?? UPLOAD_TIMEOUT_MS
  }

  /** Arms a take, replacing any earlier session. */
  arm(pkg: DancePackage, params: { section: unknown; speed: unknown; mirror: unknown }): SessionView {
    const { section, speed, mirror } = params
    const sectionCount = new CountClock(pkg).sectionCount
    if (typeof section !== "number" || !Number.isInteger(section) || section < 1 || section > sectionCount) {
      throw new UploadError(`Pick a section from 1 to ${sectionCount}.`)
    }
    if (typeof speed !== "number" || !(speed >= MIN_SPEED && speed <= MAX_SPEED)) {
      throw new UploadError(`The speed must be between ${MIN_SPEED} and ${MAX_SPEED}.`)
    }
    if (typeof mirror !== "boolean") throw new UploadError("Say whether the take is mirrored.")
    this.session = { id: randomBytes(6).toString("hex"), danceId: pkg.id, section, speed, mirror, state: "armed" }
    return this.view(this.session)
  }

  start(sid: string): SessionView {
    const s = this.find(sid)
    if (s.state !== "armed") throw new UploadError("That take isn't armed.")
    s.state = "recording"
    s.startedAt = this.now()
    return this.view(s)
  }

  stop(sid: string): SessionView {
    const s = this.find(sid)
    if (s.state !== "recording") throw new UploadError("That take isn't recording.")
    s.state = "uploading"
    s.stoppedAt = this.now()
    return this.view(s)
  }

  /** The phone's poll: counts as its heartbeat, and says what to film, if anything. */
  phoneState(): { session: SessionView | null; serverTime: number } {
    this.lastBeat = this.now()
    const s = this.session && this.view(this.session)
    return { session: s && (s.state === "armed" || s.state === "recording") ? s : null, serverTime: this.now() }
  }

  /** The glasses' poll. */
  status(): { phoneConnected: boolean; session: SessionView | null } {
    return { phoneConnected: this.now() - this.lastBeat <= PHONE_TIMEOUT_MS, session: this.session && this.view(this.session) }
  }

  /** Checks an upload can start; returns the session to save it for. */
  beginUpload(sid: string): SessionView {
    const s = this.find(sid)
    if (s.state !== "uploading") throw new UploadError("That take isn't waiting for a recording.")
    s.state = "processing"
    return this.view(s)
  }

  /** Lines the raw recording up, cuts the take, lists it, and marks the session ready (or failed with a reason). */
  async finishUpload(sid: string, raw: string, pkg: DancePackage): Promise<SessionView> {
    const s = this.find(sid)
    try {
      s.take = await this.process(s, raw, pkg)
      s.state = "ready"
      await rm(raw, { force: true })
    } catch (err) {
      s.state = "failed"
      if (err instanceof UploadError) s.reason = err.message
      else {
        console.error(err)
        s.reason = "We couldn't make a take from that recording. Try again."
      }
    }
    return this.view(s)
  }

  /** Ends the armed session as failed, e.g. when the upload itself broke. */
  fail(sid: string, reason: string): SessionView {
    const s = this.find(sid)
    s.state = "failed"
    s.reason = reason
    return this.view(s)
  }

  private find(sid: string): Session {
    if (!this.session || this.session.id !== sid) throw new NotFoundError("That recording isn't current any more.")
    return this.session
  }

  private view(s: Session): SessionView {
    // A stop with no upload behind it ends the session; checked when someone looks.
    if (s.state === "uploading" && s.stoppedAt !== undefined && this.now() - s.stoppedAt > this.uploadTimeoutMs) {
      s.state = "failed"
      s.reason = "The phone never sent the recording. Check it is still on and connected, then record again."
    }
    const { startedAt, stoppedAt, ...view } = s
    return view
  }

  private async process(s: Session, raw: string, pkg: DancePackage): Promise<Take> {
    const info = await probeVideo(raw)
    const clock = new CountClock(pkg)
    const lead = clock.leadIn(s.section)
    // The clip the glasses played starts at its lead-in, which is when the music starts in the take.
    const countOneInClip = clock.sectionStart(s.section) - (lead ? lead.start : clock.sectionStart(s.section))
    let musicStart = info.hasAudio ? findMusicStart(await decodeAudio(raw), SAMPLE_RATE) : null
    if (musicStart === null && s.startedAt !== undefined && s.stoppedAt !== undefined) {
      // The recording ends when the glasses said stop, and the clip began when they said start.
      musicStart = info.durationSec - (s.stoppedAt - s.startedAt) / 1000
    }
    if (musicStart === null || musicStart < 0) {
      throw new UploadError("We couldn't tell when the section started in that recording. Record again with the sound on.")
    }
    const offset = musicStart + countOneInClip / s.speed
    const length = (clock.sectionEnd(s.section) - clock.sectionStart(s.section)) / s.speed
    if (offset >= info.durationSec - 0.1) throw new UploadError("That recording ended before the section started. Record again.")

    const dir = takesDir(this.options.storageDir, s.danceId)
    const takes = await readTakes(this.options.storageDir, s.danceId)
    const number = Math.max(0, ...takes.filter((t) => t.section === s.section).map((t) => t.number)) + 1
    const name = `s${s.section}-t${number}`
    const out = join(dir, `${name}.tmp.mp4`)
    try {
      await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", offset.toFixed(3), "-i", raw, "-t", length.toFixed(3),
        "-vf", `${SCALE_FILTER},fps=${TAKE_FPS}`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", out])
    } catch {
      await rm(out, { force: true })
      throw new UploadError("We couldn't read that recording. Try again.")
    }
    await rename(out, join(dir, `${name}.mp4`))
    const take: Take = { name, section: s.section, speed: s.speed, mirror: s.mirror, created: new Date(this.now()).toISOString(), offset, number }
    await writeTakes(this.options.storageDir, s.danceId, [...takes, take])
    return take
  }
}

/** Where an upload is saved while it is processed; kept if processing fails, for debugging. */
export async function rawUploadPath(storageDir: string, id: string, sid: string, contentType: string): Promise<string> {
  const dir = takesDir(storageDir, id)
  await mkdir(dir, { recursive: true })
  return join(dir, `raw-${sid}.${contentType.includes("webm") ? "webm" : "mp4"}`)
}
