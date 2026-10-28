/**
 * DanceSource: where the Lens gets its dance from.
 *
 * Two operations: list the dances, and load one by name into its dance package plus its clips.
 * The Lens only ever asks a source, so where dances come from (bundled in the Lens today,
 * the phone later) can change without touching the main script.
 * Pure types: no Lens Studio APIs. T is the Lens's clip texture type.
 */
import { DancePackage } from "./DancePackage"
import { ClipPlayer } from "./VideoDriver"

/** One dance on offer. */
export interface DanceListing {
  /** The name to load it by (the package's id). */
  id: string
  title: string
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
}

export interface DanceSource<T> {
  list(): DanceListing[]
  /** Throws if there is no dance with this name. */
  load(name: string): LoadedDance<T>
}
