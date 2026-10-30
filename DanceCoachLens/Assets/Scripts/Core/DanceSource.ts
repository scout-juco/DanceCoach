/**
 * DanceSource: where the Lens gets its dance from.
 *
 * Two operations: list the dances, and load one by name into its dance package plus its clips and stills.
 * The Lens only ever asks a source, so where dances come from (bundled in the Lens, or the
 * server) can change without touching the main script. Both are asynchronous because a
 * remote source has to go over the network.
 * Pure types: no Lens Studio APIs. T is the Lens's texture type.
 */
import { DancePackage } from "./DancePackage"
import { ClipPlayer } from "./VideoDriver"

/** One dance on offer. */
export interface DanceListing {
  /** The name to load it by (the package's id). */
  id: string
  title: string
  difficulty?: string
}

/** A dance's clips, ready to play: players[i] and textures[i] are the same clip. */
export interface DanceClips<T> {
  players: ClipPlayer[]
  textures: T[]
}

export interface LoadedDance<T> {
  dance: DancePackage
  /** Null when the clips aren't available; the Lens then runs counts on a stand-in clock. */
  clips: DanceClips<T> | null
  /** The still of every half-count, as stills[section - 1][step] (see StillPlan). Null when the dance has none; Pose can't open then. */
  stills: T[][] | null
}

export interface DanceSource<T> {
  /** Rejects if the dances can't be listed (a remote source that can't be reached). */
  list(): Promise<DanceListing[]>
  /** Rejects if there is no dance with this name, or it can't be loaded. */
  load(name: string): Promise<LoadedDance<T>>
}
