/**
 * The link: which Specs and which phone are paired, whether each is alive, the Specs' last state, and the
 * phone's commands waiting for the Specs. The server is the hub; the phone and the Specs only talk to it.
 *
 * Pure and clock-injectable, like Recorder. One pairing at a time for now, but everything is keyed by Specs id.
 */
import { randomBytes, randomInt } from "node:crypto"

/** Either side is connected when it beat this recently. */
export const LINK_TIMEOUT_MS = 3000
/** A pairing code lasts this long, then a new one is issued. */
export const PAIR_CODE_MS = 10 * 60_000
/** A command not picked up by then is dropped: the dancer has moved on. */
export const COMMAND_EXPIRY_MS = 30_000

export const WRONG_CODE_MESSAGE = "That code doesn't match. Check the number on your Specs."
export const BAD_COMMAND_MESSAGE = "That isn't a command the Specs know."

export class LinkError extends Error {}
/** A phone write without a valid token. */
export class AuthError extends Error {}

export type SpecsMode = "playthrough" | "pose" | "lookback"

export interface SpecsState {
  danceId?: string
  /** 0 is the whole routine. */
  section: number
  mode: SpecsMode
  speed: number
  mirror: boolean
  running: boolean
  lookbackRecording: boolean
  finalRecording: boolean
  /** Learned section numbers per dance. */
  progress: Record<string, number[]>
}

export type CommandBody = { type: "open-dance"; danceId: string; section?: number } | { type: "end-session" }
export type Command = CommandBody & { id: string }

export type SpecsStatus = "connected" | "not-connected" | "unpaired"

export interface SpecsBeatReply {
  pairCode?: string
  paired: boolean
  phoneConnected: boolean
  commands: Command[]
}

export interface PhoneBeatReply {
  specs: SpecsStatus
  state?: SpecsState
  serverTime: number
}

interface Queued {
  command: Command
  at: number
}

interface Pairing {
  specsId: string
  token: string
}

const MODES: SpecsMode[] = ["playthrough", "pose", "lookback"]

/** Takes whatever the Specs sent and keeps only what a SpecsState can hold; null if it isn't one. */
export function cleanState(raw: unknown): SpecsState | null {
  if (!raw || typeof raw !== "object") return null
  const s = raw as Record<string, unknown>
  if (typeof s.section !== "number" || !Number.isInteger(s.section) || s.section < 0) return null
  if (!MODES.includes(s.mode as SpecsMode)) return null
  if (typeof s.speed !== "number" || !isFinite(s.speed)) return null
  const progress: Record<string, number[]> = {}
  if (s.progress && typeof s.progress === "object") {
    for (const [id, sections] of Object.entries(s.progress as Record<string, unknown>)) {
      if (Array.isArray(sections)) progress[id] = sections.filter((n): n is number => Number.isInteger(n) && n > 0)
    }
  }
  return {
    danceId: typeof s.danceId === "string" ? s.danceId : undefined,
    section: s.section,
    mode: s.mode as SpecsMode,
    speed: s.speed,
    mirror: s.mirror === true,
    running: s.running === true,
    lookbackRecording: s.lookbackRecording === true,
    finalRecording: s.finalRecording === true,
    progress,
  }
}

function cleanCommand(raw: unknown): CommandBody {
  const c = raw as Record<string, unknown> | null
  if (c && c.type === "end-session") return { type: "end-session" }
  if (c && c.type === "open-dance" && typeof c.danceId === "string" && c.danceId) {
    if (c.section === undefined) return { type: "open-dance", danceId: c.danceId }
    if (typeof c.section === "number" && Number.isInteger(c.section) && c.section >= 0) return { type: "open-dance", danceId: c.danceId, section: c.section }
  }
  throw new LinkError(BAD_COMMAND_MESSAGE)
}

export interface LinkOptions {
  now?: () => number
  /** Makes a 4-digit code. Tests fix it. */
  makeCode?: () => string
}

export class Link {
  private readonly now: () => number
  private readonly makeCode: () => string
  private pairing: Pairing | null = null
  private readonly specsBeats = new Map<string, number>()
  private readonly states = new Map<string, SpecsState>()
  private readonly queues = new Map<string, Queued[]>()
  private readonly codes = new Map<string, { code: string; at: number }>()
  private lastPhoneBeat = -Infinity
  private nextCommand = 1

  constructor(options: LinkOptions = {}) {
    this.now = options.now ?? Date.now
    this.makeCode = options.makeCode ?? (() => String(randomInt(0, 10_000)).padStart(4, "0"))
  }

  /**
   * The Specs' beat. An unpaired Specs gets a code (refreshed when it expires); a paired one gets one only if it
   * asks (`offerCode`), to pair a different phone.
   */
  specsBeat(specsId: string, state?: SpecsState | null, offerCode = false): SpecsBeatReply {
    const t = this.now()
    this.specsBeats.set(specsId, t)
    if (state) this.states.set(specsId, state)
    const paired = this.pairing?.specsId === specsId
    const reply: SpecsBeatReply = { paired, phoneConnected: this.phoneConnected(), commands: paired ? this.pending(specsId) : [] }
    if (!paired || offerCode) {
      let held = this.codes.get(specsId)
      if (!held || t - held.at > PAIR_CODE_MS) this.codes.set(specsId, (held = { code: this.makeCode(), at: t }))
      reply.pairCode = held.code
    } else {
      this.codes.delete(specsId)
    }
    return reply
  }

  /** Pairs a phone with the Specs showing this code. Replaces any earlier phone (and any earlier Specs). */
  pair(code: unknown): { phoneToken: string } {
    const t = this.now()
    const typed = typeof code === "string" ? code.trim() : ""
    for (const [specsId, held] of this.codes) {
      if (held.code === typed && t - held.at <= PAIR_CODE_MS) {
        const phoneToken = randomBytes(24).toString("hex")
        const replacedSpecs = this.pairing && this.pairing.specsId !== specsId ? this.pairing.specsId : null
        if (replacedSpecs) this.queues.delete(replacedSpecs)
        this.pairing = { specsId, token: phoneToken }
        this.codes.delete(specsId)
        this.lastPhoneBeat = -Infinity
        return { phoneToken }
      }
    }
    throw new LinkError(WRONG_CODE_MESSAGE)
  }

  /** The phone's beat. A missing or unknown token is "unpaired". */
  phoneBeat(token: string | null | undefined): PhoneBeatReply {
    const t = this.now()
    if (!this.valid(token)) return { specs: "unpaired", serverTime: t }
    this.lastPhoneBeat = t
    const { specsId } = this.pairing!
    const alive = t - (this.specsBeats.get(specsId) ?? -Infinity) <= LINK_TIMEOUT_MS
    // The state outlives the Specs going quiet, so the phone can still show progress.
    return { specs: alive ? "connected" : "not-connected", state: this.states.get(specsId), serverTime: t }
  }

  /** A phone that doesn't say who it is (the old recorder page) still counts as a phone for the Specs. */
  phoneSeen() {
    this.lastPhoneBeat = this.now()
  }

  phoneConnected(): boolean {
    return this.now() - this.lastPhoneBeat <= LINK_TIMEOUT_MS
  }

  /** True if this token may write. With nobody paired yet, writes stay open (the old pages, a fresh server). */
  mayWrite(token: string | null | undefined): boolean {
    return this.pairing === null || this.valid(token)
  }

  /** Queues a command for the paired Specs. */
  command(token: string | null | undefined, body: unknown): Command {
    if (!this.valid(token)) throw new AuthError("Pair your phone with your Specs first.")
    const cmd: Command = { id: `c${this.nextCommand++}`, ...cleanCommand(body) }
    const queue = this.queues.get(this.pairing!.specsId) ?? []
    queue.push({ command: cmd, at: this.now() })
    this.queues.set(this.pairing!.specsId, queue)
    return cmd
  }

  /** The Specs have run this command. */
  ack(specsId: string, commandId: string) {
    const queue = this.queues.get(specsId)
    if (queue) this.queues.set(specsId, queue.filter((q) => q.command.id !== commandId))
  }

  private pending(specsId: string): Command[] {
    const t = this.now()
    const live = (this.queues.get(specsId) ?? []).filter((q) => t - q.at <= COMMAND_EXPIRY_MS)
    this.queues.set(specsId, live)
    return live.map((q) => q.command)
  }

  private valid(token: string | null | undefined): boolean {
    return !!token && this.pairing !== null && token === this.pairing.token
  }
}
