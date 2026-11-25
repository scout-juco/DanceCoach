/**
 * The bundled dance source: the one dance that ships in the Lens (the test dance) and the
 * clips and stills assigned to the DanceCoach component in Lens Studio.
 */
import { listingOf } from "../Scripts/Core/DanceCards"
import { clipAssetName, planClips } from "../Scripts/Core/ClipPlan"
import { DanceClips, DanceListing, DanceSource, LoadedDance } from "../Scripts/Core/DanceSource"
import { DancePackage } from "../Scripts/Core/DancePackage"
import { stillNames } from "../Scripts/Core/StillPlan"
import { ClipPlayer } from "../Scripts/Core/VideoDriver"
import { TEST_DANCE } from "./TestDance"

export class BundledDanceSource implements DanceSource<Texture> {
  private readonly dances: DancePackage[] = [TEST_DANCE]

  /**
   * @param assignedClips the textures assigned in Lens Studio, in any order
   * @param onClipReady called when a clip's player has its video ready
   * @param assignedStills the still textures assigned in Lens Studio, in any order
   */
  constructor(
    private readonly assignedClips: Texture[],
    private readonly onClipReady: () => void = () => {},
    private readonly assignedStills: Texture[] = [],
  ) {}

  async list(): Promise<DanceListing[]> {
    return this.dances.map(listingOf)
  }

  /** The dance's thumbnail still, matched by name among the stills assigned in Lens Studio. */
  async thumbnail(listing: DanceListing): Promise<Texture | null> {
    if (!listing.thumbnail) return null
    const base = listing.thumbnail.replace(/\.[^.]+$/, "")
    return (this.assignedStills || []).find((t) => !!t && t.name.replace(/\.[^.]+$/, "") === base) ?? null
  }

  async load(name: string): Promise<LoadedDance<Texture>> {
    const dance = this.dances.find((d) => d.id === name)
    if (!dance) throw new Error(`No dance named "${name}"`)
    return { dance, clips: this.findClips(dance), stills: this.findStills(dance) }
  }

  /** Matches the still textures to the dance's stills by name; null if there are none or any is missing. */
  private findStills(dance: DancePackage): Texture[][] | null {
    const assigned = (this.assignedStills || []).filter((t) => !!t)
    if (assigned.length === 0) return null
    const byName = new Map<string, Texture>()
    for (const t of assigned) byName.set(t.name.replace(/\.[^.]+$/, ""), t)
    const stills: Texture[][] = []
    for (const names of dance.stills ?? stillNames(dance)) {
      const row: Texture[] = []
      for (const file of names) {
        const texture = byName.get(file.replace(/\.[^.]+$/, ""))
        if (!texture) {
          print(`DanceCoach: still ${file} isn't assigned to Pose Stills (run npm run stills, then add them)`)
          return null
        }
        row.push(texture)
      }
      stills.push(row)
    }
    return stills
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
