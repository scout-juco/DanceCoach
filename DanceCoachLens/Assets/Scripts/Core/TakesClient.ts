/**
 * TakesClient: the ingest server's takes API (server/ingestServer.ts), for Lookback.
 *
 *   GET  <base>/dances/<id>/takes?section=n   → the section's takes
 *   GET  <base>/recorder/status               → { phoneConnected, session }
 *   POST <base>/dances/<id>/takes/session     → arms a take; POST <base>/takes/session/<sid>/start | stop
 *   GET  <base>/dances/<id>/takes/<name>.mp4  → a take's video (downloaded like a clip)
 *
 * The network is injected, so this is pure (no Lens Studio APIs) and Vitest drives it with fake fetch.
 */

/** The requests the takes API needs; RemoteTransport has them all. */
export interface TakesTransport {
  getJson(url: string): Promise<unknown>
  postJson(url: string, body: unknown): Promise<unknown>
  /** Downloads a video; resolves with whatever the transport makes of it (a video texture and its player). */
  loadClip(url: string): Promise<unknown>
}

export interface Take {
  /** The file name without .mp4, e.g. s2-t3. */
  name: string
  section: number
  /** The speed it was filmed at (0.75 for a 0.75× run). */
  speed: number
  mirror: boolean
  /** Per section, counting up from 1. */
  number: number
}

export type SessionState = "armed" | "recording" | "uploading" | "processing" | "ready" | "failed"

export interface RecorderSession {
  id: string
  state: SessionState
  /** Once ready. */
  take?: Take
  /** When failed. */
  reason?: string
}

export interface RecorderStatus {
  phoneConnected: boolean
  session: RecorderSession | null
}

export interface TakeParams {
  section: number
  speed: number
  mirror: boolean
}

const STATES: SessionState[] = ["armed", "recording", "uploading", "processing", "ready", "failed"]

function parseTake(raw: any, i: number): Take {
  if (!raw || typeof raw.name !== "string" || typeof raw.section !== "number" || typeof raw.speed !== "number" || typeof raw.number !== "number")
    throw new Error(`Take ${i + 1} in the list is malformed`)
  return { name: raw.name, section: raw.section, speed: raw.speed, mirror: !!raw.mirror, number: raw.number }
}

function parseSession(raw: any): RecorderSession | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw.id !== "string" || !STATES.includes(raw.state)) throw new Error("The recorder's session is malformed")
  return {
    id: raw.id,
    state: raw.state,
    take: raw.take ? parseTake(raw.take, 0) : undefined,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
  }
}

export class TakesClient {
  private readonly base: string

  constructor(
    baseUrl: string,
    private readonly transport: TakesTransport,
  ) {
    this.base = baseUrl.replace(/\/+$/, "")
  }

  /** A section's takes, oldest first (by take number). */
  async list(danceId: string, section: number): Promise<Take[]> {
    const raw = await this.transport.getJson(`${this.base}/dances/${encodeURIComponent(danceId)}/takes?section=${section}`)
    if (!Array.isArray(raw)) throw new Error("The takes list isn't a list")
    return raw.map(parseTake).sort((a, b) => a.number - b.number)
  }

  async status(): Promise<RecorderStatus> {
    const raw: any = await this.transport.getJson(`${this.base}/recorder/status`)
    if (!raw || typeof raw.phoneConnected !== "boolean") throw new Error("The recorder status is malformed")
    return { phoneConnected: raw.phoneConnected, session: parseSession(raw.session) }
  }

  /** Arms a take; the phone starts filming. Returns the session id. */
  async arm(danceId: string, params: TakeParams): Promise<string> {
    const raw: any = await this.transport.postJson(`${this.base}/dances/${encodeURIComponent(danceId)}/takes/session`, params)
    if (!raw || typeof raw.id !== "string") throw new Error("The server didn't start a take")
    return raw.id
  }

  async start(sessionId: string): Promise<void> {
    await this.transport.postJson(`${this.base}/takes/session/${encodeURIComponent(sessionId)}/start`, {})
  }

  async stop(sessionId: string): Promise<void> {
    await this.transport.postJson(`${this.base}/takes/session/${encodeURIComponent(sessionId)}/stop`, {})
  }

  /** Downloads a take's video like a clip. */
  loadTake(danceId: string, take: Take): Promise<unknown> {
    return this.transport.loadClip(this.takeUrl(danceId, take))
  }

  /** Where a take's video is, for loadClip. */
  takeUrl(danceId: string, take: Take): string {
    return `${this.base}/dances/${encodeURIComponent(danceId)}/takes/${encodeURIComponent(take.name)}.mp4`
  }
}
