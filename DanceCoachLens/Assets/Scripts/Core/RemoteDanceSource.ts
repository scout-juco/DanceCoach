/**
 * RemoteDanceSource: the dances the ingest server has ready (server/ingestServer.ts).
 *
 *   GET <base>/dances                 → [{ id, title, difficulty, sections, lengthSec, thumbnail }]
 *   GET <base>/dances/<id>/package    → the dance package
 *   GET <base>/dances/<id>/clips/<n>  → one clip, named <video>_<clip id>.mp4 (see ClipPlan)
 *   GET <base>/dances/<id>/stills/<n> → one still, a name from the package's stills (see StillPlan)
 *
 * Loading a dance fetches its package, works out its clips with planClips (the same plan the
 * server cut them with) and downloads each by name, then the package's stills the same way. If any of it fails, the load fails: a dance
 * with missing clips would play with wrong counts.
 * The network is injected, so this is pure (no Lens Studio APIs) and Vitest drives it with fakes.
 */
import { clipAssetName, planClips } from "./ClipPlan"
import { DanceListing, DanceSource, LoadedDance } from "./DanceSource"
import { loadDancePackage } from "./DancePackage"
import { ClipPlayer, VideoPlayer } from "./VideoDriver"

/** A downloaded clip: the player that plays it and the texture that shows it. */
export interface RemoteClip<T> {
  player: VideoPlayer
  texture: T
}

export interface RemoteTransport<T> {
  /** GETs a URL and parses the JSON; rejects on a network error or a non-success status. */
  getJson(url: string): Promise<unknown>
  /** POSTs a JSON body and parses the JSON reply; rejects on a network error or a non-success status. */
  postJson(url: string, body: unknown): Promise<unknown>
  /** Downloads a video and turns it into a video texture; rejects on failure. */
  loadClip(url: string): Promise<RemoteClip<T>>
  /** Downloads an image and turns it into a texture; rejects on failure. */
  loadStill(url: string): Promise<T>
}

/** How many downloads run at once: a dance has dozens of stills and the glasses drop requests when they're all started together. */
export const MAX_CONCURRENT_DOWNLOADS = 4
/** How many times a failed download is tried again before the load fails. */
export const DOWNLOAD_RETRIES = 2

export class RemoteDanceSource<T> implements DanceSource<T> {
  private readonly base: string

  constructor(
    baseUrl: string,
    private readonly transport: RemoteTransport<T>,
  ) {
    this.base = baseUrl.replace(/\/+$/, "")
  }

  async list(): Promise<DanceListing[]> {
    const raw = await this.transport.getJson(`${this.base}/dances`)
    if (!Array.isArray(raw)) throw new Error("The dance list isn't a list")
    return raw.map((d, i) => {
      if (!d || typeof d.id !== "string" || typeof d.title !== "string") throw new Error(`Dance ${i + 1} in the list is malformed`)
      const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? v : undefined)
      return { id: d.id, title: d.title, difficulty: typeof d.difficulty === "string" ? d.difficulty : undefined, sections: num(d.sections), lengthSec: num(d.lengthSec), thumbnail: typeof d.thumbnail === "string" && d.thumbnail ? d.thumbnail : undefined }
    })
  }

  async thumbnail(listing: DanceListing): Promise<T | null> {
    if (!listing.thumbnail) return null
    return this.transport.loadStill(`${this.base}/dances/${encodeURIComponent(listing.id)}/stills/${encodeURIComponent(listing.thumbnail)}`)
  }

  async load(name: string, onProgress: (fraction: number) => void = () => {}): Promise<LoadedDance<T>> {
    const dir = `${this.base}/dances/${encodeURIComponent(name)}`
    onProgress(0)
    const dance = loadDancePackage(await this.transport.getJson(`${dir}/package`))
    const clips = planClips(dance)
    // The package, every clip and every still each count once.
    const total = 1 + clips.length + (dance.stills ? dance.stills.reduce((n, names) => n + names.length, 0) : 0)
    let done = 1
    onProgress(done / total)
    const queue = new DownloadQueue(() => onProgress(++done / total))
    const downloaded = await Promise.all(clips.map((clip) => queue.run(() => this.transport.loadClip(`${dir}/clips/${clipAssetName(dance.video, clip.id)}.mp4`))))
    const players: ClipPlayer[] = downloaded.map((d, i) => ({ clip: clips[i], player: d.player }))
    const stills = dance.stills ? await Promise.all(dance.stills.map((names) => Promise.all(names.map((n) => queue.run(() => this.transport.loadStill(`${dir}/stills/${encodeURIComponent(n)}`)))))) : null
    return { dance, clips: { players, textures: downloaded.map((d) => d.texture) }, stills, fromServer: true }
  }
}

/** Runs downloads a few at a time, trying each again if it fails. */
class DownloadQueue {
  private active = 0
  private waiting: (() => void)[] = []

  /** @param onDone called as each download succeeds */
  constructor(private readonly onDone: () => void = () => {}) {}

  async run<R>(task: () => Promise<R>): Promise<R> {
    while (this.active >= MAX_CONCURRENT_DOWNLOADS) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.active++
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await task()
          this.onDone()
          return result
        } catch (err) {
          if (attempt >= DOWNLOAD_RETRIES) throw err
        }
      }
    } finally {
      this.active--
      const next = this.waiting.shift()
      if (next) next()
    }
  }
}
