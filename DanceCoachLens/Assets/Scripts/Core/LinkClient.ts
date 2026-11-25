/**
 * LinkClient: the Specs' side of the link to the phone (server/link.ts is the hub).
 *
 *   POST <base>/link/specs/beat   { specsId, state, ack? }  →  { pairCode?, paired, phoneConnected, commands }
 *
 * Every BEAT_SEC it sends the current SpecsState and reads back the pairing code (while unpaired), whether it is paired, whether the
 * phone is connected, and the phone's commands. Each command is handed to onCommand once and acked on a following beat. One beat is in
 * flight at a time; a failed or malformed reply is ignored and the next beat tries again.
 *
 * The network is injected, like TakesClient's, so this is pure (no Lens Studio APIs) and Vitest drives it with a fake transport.
 */
import { SpecsState } from "./LinkState"

/** The one request the link needs; RemoteTransport has it. */
export interface LinkTransport {
  postJson(url: string, body: unknown): Promise<unknown>
}

export type LinkCommand = { id: string } & ({ type: "open-dance"; danceId: string; section?: number } | { type: "end-session" })

/** What the pairing card and the rest of the Lens read. */
export interface LinkView {
  /** The code to show while unpaired; null once paired, or before the server has said. */
  pairCode: string | null
  /** Null until the server has answered (or the saved pairing says), so no card flashes up on start. */
  paired: boolean | null
  phoneConnected: boolean
}

/** What survives a Lens restart. */
export interface SavedLink {
  specsId: string
  paired: boolean
}

export const BEAT_SEC = 0.5

/** A reply has to be an object with a boolean `paired`; anything else is ignored. */
function parseCommand(raw: any): LinkCommand | null {
  if (!raw || typeof raw.id !== "string" || !raw.id) return null
  if (raw.type === "end-session") return { id: raw.id, type: "end-session" }
  if (raw.type === "open-dance" && typeof raw.danceId === "string" && raw.danceId) {
    if (raw.section === undefined) return { id: raw.id, type: "open-dance", danceId: raw.danceId }
    if (typeof raw.section === "number" && Number.isInteger(raw.section) && raw.section >= 0) return { id: raw.id, type: "open-dance", danceId: raw.danceId, section: raw.section }
  }
  return null
}

export class LinkClient {
  /** Called once per command; the Lens carries it out. The client acks it as soon as this returns. */
  onCommand: (command: LinkCommand) => void = () => {}
  /** Called when the Specs id or paired state changes, to be saved. */
  onSave: (saved: SavedLink) => void = () => {}

  private readonly base: string
  private readonly specsId: string
  private paired: boolean | null
  private pairCode: string | null = null
  private phoneConnected = false
  private inFlight = false
  private waited = BEAT_SEC
  // Commands already run (so a beat that repeats one, before its ack lands, doesn't run it twice) and acks still to send.
  private handled = new Set<string>()
  private acks: string[] = []
  private acked = new Set<string>()
  // A new Specs id, not saved yet: onSave is wired after construction, so it goes out on the first tick.
  private unsaved = false

  /**
   * @param saved what was saved last run, if anything
   * @param makeId makes a new Specs id when there is none saved
   */
  constructor(
    baseUrl: string,
    private readonly transport: LinkTransport,
    saved: SavedLink | null,
    makeId: () => string,
  ) {
    this.base = baseUrl.replace(/\/+$/, "")
    this.specsId = saved && saved.specsId ? saved.specsId : makeId()
    this.paired = saved && saved.specsId ? saved.paired : null
    this.unsaved = !saved || !saved.specsId
  }

  get id(): string {
    return this.specsId
  }

  get view(): LinkView {
    return { pairCode: this.pairCode, paired: this.paired, phoneConnected: this.phoneConnected }
  }

  /** Call every frame with a way to read the current state; beats when BEAT_SEC has passed and none is in flight. */
  tick(dtSec: number, state: () => SpecsState) {
    if (this.unsaved) {
      this.unsaved = false
      this.onSave({ specsId: this.specsId, paired: false })
    }
    this.waited += dtSec
    if (this.waited < BEAT_SEC || this.inFlight) return
    this.waited = 0
    this.beat(state())
  }

  private beat(state: SpecsState) {
    this.inFlight = true
    const ack = this.acks[0]
    const body: Record<string, unknown> = { specsId: this.specsId, state }
    if (ack) body.ack = ack
    this.transport.postJson(`${this.base}/link/specs/beat`, body).then(
      (raw) => {
        this.inFlight = false
        if (ack) {
          this.acks.shift()
          this.acked.add(ack)
        }
        this.take(raw)
      },
      () => {
        this.inFlight = false
      },
    )
  }

  private take(raw: any) {
    if (!raw || typeof raw !== "object" || typeof raw.paired !== "boolean" || !Array.isArray(raw.commands)) return
    const was = this.paired
    this.paired = raw.paired
    this.pairCode = !raw.paired && typeof raw.pairCode === "string" && raw.pairCode ? raw.pairCode : null
    this.phoneConnected = raw.phoneConnected === true
    if (was !== this.paired) this.onSave({ specsId: this.specsId, paired: this.paired })
    for (const item of raw.commands) {
      const command = parseCommand(item)
      if (!command) continue
      if (!this.handled.has(command.id)) {
        this.handled.add(command.id)
        this.onCommand(command)
      }
      if (!this.acked.has(command.id) && !this.acks.includes(command.id)) this.acks.push(command.id)
    }
  }
}
