/** What the phone knows about the Specs, from the server's beat. Pure functions plus a small poller (the `useLink` of every screen). */
import type { PhoneBeatReply, SpecsState } from "../../link"

export type SpecsConnection = "connected" | "not-connected" | "unpaired"

/** The one wording for the status chip, on every screen. */
export const STATUS_LABEL = { connected: "Specs connected", "not-connected": "Not connected" } as const

export const TOKEN_KEY = "dancecoach.phoneToken"
export const POLL_MS = 1000

export interface LinkSnapshot {
  status: SpecsConnection
  state?: SpecsState
  /** True when the server itself could not be reached (as opposed to the Specs being quiet). */
  serverDown: boolean
}

export const UNPAIRED: LinkSnapshot = { status: "unpaired", serverDown: false }

/** A beat reply (or its absence, when the request failed) becomes what the screens show. */
export function statusFromBeat(reply: Pick<PhoneBeatReply, "specs" | "state"> | null): LinkSnapshot {
  if (!reply) return { status: "not-connected", serverDown: true }
  return { status: reply.specs, state: reply.state, serverDown: false }
}

export interface PollerDeps {
  getToken: () => string | null
  setToken: (token: string | null) => void
  fetchJson: (token: string) => Promise<Pick<PhoneBeatReply, "specs" | "state">>
  isVisible: () => boolean
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (id: unknown) => void
}

/** Beats once a second while the page is visible and shares the latest snapshot with whoever subscribed. */
export class LinkPoller {
  snapshot: LinkSnapshot = UNPAIRED
  private listeners = new Set<(s: LinkSnapshot) => void>()
  private timer: unknown = null
  private running = false

  constructor(private deps: PollerDeps) {}

  subscribe(fn: (s: LinkSnapshot) => void): () => void {
    this.listeners.add(fn)
    fn(this.snapshot)
    return () => this.listeners.delete(fn)
  }

  start() {
    this.running = true
    void this.tick()
  }

  stop() {
    this.running = false
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = null
  }

  /** Visibility came back: beat now instead of waiting. */
  wake() {
    if (this.running && this.timer !== null) {
      this.deps.clearTimer(this.timer)
      void this.tick()
    }
  }

  async tick() {
    this.timer = null
    if (!this.running) return
    if (this.deps.isVisible()) await this.beat()
    if (this.running) this.timer = this.deps.setTimer(() => void this.tick(), POLL_MS)
  }

  /** One beat. A token the server no longer knows (it restarted) is dropped, which sends the app to pair. */
  async beat() {
    const token = this.deps.getToken()
    if (!token) return this.publish(UNPAIRED)
    let next: LinkSnapshot
    try {
      next = statusFromBeat(await this.deps.fetchJson(token))
    } catch {
      next = statusFromBeat(null)
    }
    if (next.status === "unpaired") this.deps.setToken(null)
    this.publish(next)
  }

  private publish(next: LinkSnapshot) {
    this.snapshot = next
    for (const fn of this.listeners) fn(next)
  }
}
