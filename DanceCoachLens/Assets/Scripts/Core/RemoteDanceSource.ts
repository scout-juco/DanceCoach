/**
 * RemoteDanceSource: the dances the ingest server has ready (server/ingestServer.ts).
 *
 *   GET <base>/dances                 → [{ id, title, difficulty }]
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
  /** Downloads a video and turns it into a video texture; rejects on failure. */
  loadClip(url: string): Promise<RemoteClip<T>>
  /** Downloads an image and turns it into a texture; rejects on failure. */
  loadStill(url: string): Promise<T>
}

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
      return { id: d.id, title: d.title, difficulty: typeof d.difficulty === "string" ? d.difficulty : undefined }
    })
  }

  async load(name: string): Promise<LoadedDance<T>> {
    const dir = `${this.base}/dances/${encodeURIComponent(name)}`
    const dance = loadDancePackage(await this.transport.getJson(`${dir}/package`))
    const clips = planClips(dance)
    const downloaded = await Promise.all(clips.map((clip) => this.transport.loadClip(`${dir}/clips/${clipAssetName(dance.video, clip.id)}.mp4`)))
    const players: ClipPlayer[] = downloaded.map((d, i) => ({ clip: clips[i], player: d.player }))
    const stills = dance.stills ? await Promise.all(dance.stills.map((names) => Promise.all(names.map((n) => this.transport.loadStill(`${dir}/stills/${encodeURIComponent(n)}`))))) : null
    return { dance, clips: { players, textures: downloaded.map((d) => d.texture) }, stills }
  }
}
