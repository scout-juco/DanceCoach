/**
 * DancePicker: the rules of the pick-a-dance panel, apart from how it looks.
 *
 * It lists the server's dances, loads the one picked, and hands it to onLoaded. If the server
 * can't be reached it offers the fallback source's dances instead and says they're offline.
 * A load that fails or takes longer than the limit shows a could-not-load message; retry tries
 * it again and back returns to the list. Answers that arrive after the picker has moved on
 * (a retry, a back, a timeout) are ignored.
 * Pure: no Lens Studio APIs. The Lens calls tick() each frame so slow loads time out.
 */
import { DanceListing, DanceSource, LoadedDance } from "./DanceSource"

/** What the panel shows. */
export type PickerView =
  | { kind: "loadingList" }
  | { kind: "list"; dances: DanceListing[]; offline: boolean }
  | { kind: "loadingDance"; title: string }
  | { kind: "failed"; title: string }

/** How long a list or a dance may take to come back, in seconds. */
export const LIST_TIMEOUT_SEC = 8
export const LOAD_TIMEOUT_SEC = 30

export class DancePicker<T> {
  /** Called with the dance once it has loaded; the picker is then closed. */
  onLoaded: (loaded: LoadedDance<T>) => void = () => {}

  private state: PickerView | null = null
  private dances: DanceListing[] = []
  private offline = false
  private picked: DanceListing | null = null
  // Bumped whenever an answer in flight stops mattering.
  private generation = 0
  private waited = 0

  /**
   * @param remote the server's dances
   * @param fallback what is offered when the server can't be reached
   */
  constructor(
    private readonly remote: DanceSource<T>,
    private readonly fallback: DanceSource<T>,
  ) {}

  /** What the panel shows; null while no picking is going on. */
  get view(): PickerView | null {
    return this.state
  }

  /** Starts (or restarts) from the list of dances. */
  open() {
    const gen = this.begin({ kind: "loadingList" })
    this.remote.list().then(
      (dances) => {
        if (gen !== this.generation) return
        this.showList(dances, false)
      },
      () => this.offerFallback(gen),
    )
  }

  /** Loads a dance from the list. */
  pick(id: string) {
    if (this.state?.kind !== "list") return
    const listing = this.dances.find((d) => d.id === id)
    if (listing) this.load(listing)
  }

  /** From a could-not-load message, tries the same dance again; from the offline list, tries the server again. */
  retry() {
    if (this.state?.kind === "failed" && this.picked) this.load(this.picked)
    else if (this.state?.kind === "list" && this.offline) this.open()
  }

  /** From a could-not-load message, back to the list. */
  back() {
    if (this.state?.kind === "failed") this.state = { kind: "list", dances: this.dances, offline: this.offline }
  }

  /** Call every frame: a list or a dance that takes too long gives up. */
  tick(dtSec: number) {
    const s = this.state
    if (!s || (s.kind !== "loadingList" && s.kind !== "loadingDance")) return
    this.waited += dtSec
    if (s.kind === "loadingList" && this.waited >= LIST_TIMEOUT_SEC) this.offerFallback(this.generation)
    if (s.kind === "loadingDance" && this.waited >= LOAD_TIMEOUT_SEC) this.fail(this.generation)
  }

  private load(listing: DanceListing) {
    this.picked = listing
    const gen = this.begin({ kind: "loadingDance", title: listing.title })
    const source = this.offline ? this.fallback : this.remote
    source.load(listing.id).then(
      (loaded) => {
        if (gen !== this.generation) return
        this.state = null
        this.onLoaded(loaded)
      },
      () => this.fail(gen),
    )
  }

  private offerFallback(gen: number) {
    if (gen !== this.generation) return
    const next = this.begin({ kind: "loadingList" })
    this.fallback.list().then(
      (dances) => {
        if (next === this.generation) this.showList(dances, true)
      },
      () => {
        if (next === this.generation) this.showList([], true)
      },
    )
  }

  private showList(dances: DanceListing[], offline: boolean) {
    this.dances = dances
    this.offline = offline
    this.state = { kind: "list", dances, offline }
  }

  private fail(gen: number) {
    if (gen !== this.generation) return
    this.generation++
    this.state = { kind: "failed", title: this.picked!.title }
  }

  private begin(state: PickerView): number {
    this.state = state
    this.waited = 0
    return ++this.generation
  }
}
