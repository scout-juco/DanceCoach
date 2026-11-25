/**
 * LinkState: the SpecsState the Lens beats to the server (the same shape as server/link.ts's, which cleans it on arrival),
 * built from what the controllers say. Pure, so Vitest covers it.
 */
import { decodeDoneSections } from "./SettingsStore"

export type SpecsMode = "playthrough" | "pose" | "lookback"

export interface SpecsState {
  danceId?: string
  /** 0 is the whole routine. */
  section: number
  mode: SpecsMode
  speed: number
  mirror: boolean
  running: boolean
  lookbackRecording: boolean
  finalRecording: boolean
  /** Learned section numbers per dance. */
  progress: Record<string, number[]>
}

export interface SpecsStateInput {
  /** The dance being practised; undefined while picking one. */
  danceId?: string
  mode: "Playthrough" | "Pose" | "Lookback"
  /** The playback controller's section, and whether its run is the whole routine. */
  section: number
  wholeRoutine: boolean
  /** Pose's or Lookback's own section when it is up (Lookback's 0 is the whole routine). */
  modeSection?: number
  speed: number
  mirror: boolean
  /** A run is counting in or playing. */
  running: boolean
  lookbackRecording: boolean
  /** The dances the Lens knows (listed, plus the open one), to report progress for. */
  danceIds: string[]
  /** A dance's saved done-sections string, as stored. */
  savedProgress: (danceId: string) => string | null | undefined
}

export function buildSpecsState(i: SpecsStateInput): SpecsState {
  const progress: Record<string, number[]> = {}
  for (const id of i.danceIds) if (!(id in progress)) progress[id] = decodeDoneSections(i.savedProgress(id))
  const picking = i.danceId === undefined
  return {
    danceId: i.danceId,
    section: picking ? 0 : i.modeSection !== undefined ? i.modeSection : i.wholeRoutine ? 0 : i.section,
    mode: i.mode === "Pose" ? "pose" : i.mode === "Lookback" ? "lookback" : "playthrough",
    speed: i.speed,
    mirror: i.mirror,
    running: !picking && i.running,
    lookbackRecording: !picking && i.lookbackRecording,
    // "Record your dance" isn't built yet.
    finalRecording: false,
    progress,
  }
}
