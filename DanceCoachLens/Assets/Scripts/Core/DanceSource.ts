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
  /** How many 8-count sections it has, when the source knows (the picker's "N sections"). */
  sections?: number
  /** The routine's length in seconds, when the source knows. */
  lengthSec?: number
  /** The name of a still that stands for the dance on its card (one of the package's stills), when it has stills. */
  thumbnail?: string
  /** Set aside with "Save for later" on the phone. */
  saved?: boolean
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
  /** The dance came from the server, so Lookback can record against it. Absent for the bundled test dance. */
  fromServer?: boolean
}

export interface DanceSource<T> {
  /** Rejects if the dances can't be listed (a remote source that can't be reached). */
  list(): Promise<DanceListing[]>
  /** Rejects if there is no dance with this name, or it can't be loaded. onProgress is told how much is in, 0 to 1. */
  load(name: string, onProgress?: (fraction: number) => void): Promise<LoadedDance<T>>
  /** The listing's thumbnail still as a texture, or null when it has none. Optional: a source without it shows no thumbnails. */
  thumbnail?(listing: DanceListing): Promise<T | null>
}
