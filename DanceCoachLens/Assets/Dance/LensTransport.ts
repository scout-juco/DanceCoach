/**
 * The Lens's network for RemoteDanceSource: JSON over the Internet Module's fetch, and clips
 * and stills downloaded by the Remote Media Module and turned into video and image textures.
 */
import { RemoteClip, RemoteTransport } from "../Scripts/Core/RemoteDanceSource"

export class LensTransport implements RemoteTransport<Texture> {
  /**
   * @param internet the Internet Module asset
   * @param media the Remote Media Module asset
   * @param onClipReady called when a clip's player has its video ready
   */
  constructor(
    private readonly internet: InternetModule,
    private readonly media: RemoteMediaModule,
    private readonly onClipReady: () => void = () => {},
  ) {}

  async getJson(url: string): Promise<unknown> {
    const response = await this.internet.fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
    return response.json()
  }

  loadStill(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const resource = this.internet.makeResourceFromUrl(url)
      this.media.loadResourceAsImageTexture(resource, resolve, (error) => reject(new Error(`Couldn't load ${url}: ${error}`)))
    })
  }

  loadClip(url: string): Promise<RemoteClip<Texture>> {
    return new Promise((resolve, reject) => {
      const resource = this.internet.makeResourceFromUrl(url)
      this.media.loadResourceAsVideoTexture(
        resource,
        (texture) => {
          const player = texture.control as VideoTextureProvider
          player.volume = 1
          player.onPlaybackReady.add(() => this.onClipReady())
          resolve({ player, texture })
        },
        (error) => reject(new Error(`Couldn't load ${url}: ${error}`)),
      )
    })
  }
}
