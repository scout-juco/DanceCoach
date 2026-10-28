/**
 * The bundled dance source: the one dance that ships in the Lens (the test dance) and the
 * clips assigned to the DanceCoach component in Lens Studio.
 */
import { clipAssetName, planClips } from "../Scripts/Core/ClipPlan"
import { DanceClips, DanceListing, DanceSource, LoadedDance } from "../Scripts/Core/DanceSource"
import { DancePackage } from "../Scripts/Core/DancePackage"
import { ClipPlayer } from "../Scripts/Core/VideoDriver"
import { TEST_DANCE } from "./TestDance"

export class BundledDanceSource implements DanceSource<Texture> {
  private readonly dances: DancePackage[] = [TEST_DANCE]

  /**
   * @param assignedClips the textures assigned in Lens Studio, in any order
   * @param onClipReady called when a clip's player has its video ready
   */
  constructor(
    private readonly assignedClips: Texture[],
    private readonly onClipReady: () => void = () => {},
  ) {}

  list(): DanceListing[] {
    return this.dances.map((d) => ({ id: d.id, title: d.title }))
  }

  load(name: string): LoadedDance<Texture> {
    const dance = this.dances.find((d) => d.id === name)
    if (!dance) throw new Error(`No dance named "${name}"`)
    return { dance, clips: this.findClips(dance) }
  }

  /** Matches the clip textures to the dance's clip plan by name; null if any clip is missing. */
  private findClips(dance: DancePackage): DanceClips<Texture> | null {
    const assigned = (this.assignedClips || []).filter((t) => !!t)
    if (assigned.length === 0) return null
    const players: ClipPlayer[] = []
    const textures: Texture[] = []
    for (const clip of planClips(dance)) {
      const name = clipAssetName(dance.video, clip.id)
      const texture = assigned.find((t) => t.name.replace(/\.[^.]+$/, "") === name)
      if (!texture) {
        print(`DanceCoach: clip ${name} isn't assigned to Video Clips (run npm run clips, then add it)`)
        return null
      }
      const player = texture.control as VideoTextureProvider
      player.volume = 1
      player.onPlaybackReady.add(() => this.onClipReady())
      players.push({ clip, player })
      textures.push(texture)
    }
    return { players, textures }
  }
}
