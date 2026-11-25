/**
 * DialogCopy: the words the dialogs build from the view state (BUILD_SPEC screens J and G), kept pure so Vitest covers them.
 */
import { ViewState } from "./PlaybackController"

/** "0.75×", "1×". */
export const speedLabel = (speed: number) => `${speed}×`

/** Routine done's eyebrow: "FROM THE TOP · SECTION 1 → SECTION 4 · 1×". */
export function routineDoneEyebrow(view: Pick<ViewState, "runKind" | "section" | "runStop" | "sectionCount" | "settings">): string {
  const last = view.runKind === "section" ? view.runStop : view.runStop || view.sectionCount
  const first = view.runKind === "section" ? view.section : 1
  const kind = view.runKind === "top" ? "FROM THE TOP" : view.runKind === "full" ? "FULL ROUTINE" : null
  const range = first === last ? `SECTION ${first}` : `SECTION ${first} → SECTION ${last}`
  return [kind, range, speedLabel(view.settings.speed)].filter(Boolean).join(" · ")
}

/** Record lookback?'s Speed · mirror row: "0.75× · ON". */
export const speedMirrorLabel = (speed: number, mirror: boolean) => `${speedLabel(speed)} · ${mirror ? "ON" : "OFF"}`

export const PAIR_TITLE = "Pair your phone"
export const PAIR_BODY = "Open Dance Coach on your phone\nand type this number."
export const PAIR_WAITING = "Waiting for your phone"

/** The pairing code spaced out so each digit reads on its own: "4729" → "4 7 2 9". */
export const pairCodeText = (code: string) => code.split("").join(" ")
