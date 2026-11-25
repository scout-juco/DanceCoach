/**
 * DancePicker: the rules of the pick-a-dance panel, apart from how it looks.
 *
 * It lists the server's dances, loads the one picked, and hands it to onLoaded. If the server
 * can't be reached it offers the fallback source's dances instead and says they're offline.
 * A load that fails or goes the limit without any progress shows a could-not-load message; retry tries
 * it again and back returns to the list (from a loading dance too, which stops waiting for it). Answers that arrive after the picker has moved on
 * (a retry, a back, a timeout) are ignored.
 * Pure: no Lens Studio APIs. The Lens calls tick() each frame so slow loads time out.
 */
import { DanceListing, DanceSource, LoadedDance } from "./DanceSource"

/** What the panel shows. */
export type PickerView =
  | { kind: "loadingList" }
  | { kind: "list"; dances: DanceListing[]; offline: boolean }
  | { kind: "loadingDance"; title: string; /** How much of the dance is in, 0 to 1. */ progress: number }
  | { kind: "failed"; title: string }

/** How long a list or a dance may take to come back, in seconds. */
export const LIST_TIMEOUT_SEC = 8
export const LOAD_TIMEOUT_SEC = 30

export class DancePicker<T> {
  /** Called with the dance once it has loaded (and the section the phone asked for, if it did); the picker is then closed. */
  onLoaded: (loaded: LoadedDance<T>, section?: number) => void = () => {}

  private state: PickerView | null = null
  private dances: DanceListing[] = []
  private offline = false
  private picked: DanceListing | null = null
  // A dance the phone asked for, waiting for the list to arrive.
  private requested: { id: string; section?: number } | null = null
  // The section the dance being loaded was asked to open at.
  private pickedSection: number | undefined = undefined
  // Bumped whenever an answer in flight stops mattering.
  private generation = 0
  private waited = 0
  private thumbnails = new Map<string, T>()

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

  /** The dances last listed (empty before a list has arrived). */
  get listed(): DanceListing[] {
    return this.dances
  }

  /**
   * Opens a dance the phone asked for, by the same path as a pinch on its card: from the list it loads at once; otherwise the
   * list is fetched (again, if a load was under way) and the dance loads when it arrives. A dance the list doesn't have is dropped.
   * `section` goes to onLoaded.
   */
  request(id: string, section?: number) {
    this.requested = { id, section }
    if (this.state?.kind === "list") return this.resolveRequest()
    if (this.state?.kind !== "loadingList") this.open()
  }

  private resolveRequest() {
    const want = this.requested
    this.requested = null
    const listing = want && this.dances.find((d) => d.id === want.id)
    if (want && listing) this.load(listing, want.section)
  }

  /** From a could-not-load message, tries the same dance again; from the offline list, tries the server again. */
  retry() {
    if (this.state?.kind === "failed" && this.picked) this.load(this.picked)
    else if (this.state?.kind === "list" && this.offline) this.open()
  }

  /** From a could-not-load message or a loading dance, back to the list. */
  back() {
    if (this.state?.kind === "loadingDance") this.generation++
    if (this.state?.kind === "failed" || this.state?.kind === "loadingDance") this.state = { kind: "list", dances: this.dances, offline: this.offline }
  }

  /** Call every frame: a list or a dance that takes too long gives up. */
  tick(dtSec: number) {
    const s = this.state
    if (!s || (s.kind !== "loadingList" && s.kind !== "loadingDance")) return
    this.waited += dtSec
    if (s.kind === "loadingList" && this.waited >= LIST_TIMEOUT_SEC) this.offerFallback(this.generation)
    if (s.kind === "loadingDance" && this.waited >= LOAD_TIMEOUT_SEC) this.fail(this.generation)
  }

  private load(listing: DanceListing, section?: number) {
    this.picked = listing
    this.pickedSection = section
    const gen = this.begin({ kind: "loadingDance", title: listing.title, progress: 0 })
    const source = this.offline ? this.fallback : this.remote
    // Waiting for a dance is for it to stall, not for it to be big: progress starts the wait again.
    const onProgress = (progress: number) => {
      if (gen !== this.generation || this.state?.kind !== "loadingDance") return
      this.state = { ...this.state, progress }
      this.waited = 0
    }
    source.load(listing.id, onProgress).then(
      (loaded) => {
        if (gen !== this.generation) return
        this.state = null
        this.onLoaded(loaded, this.pickedSection)
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
    this.loadThumbnails(dances, offline ? this.fallback : this.remote)
    if (this.requested) this.resolveRequest()
  }

  /** The thumbnail of a listed dance, once it has arrived. */
  thumbnail(id: string): T | undefined {
    return this.thumbnails.get(id)
  }

  /** Fetches each dance's thumbnail in the background; one that can't be had is just left out. */
  private loadThumbnails(dances: DanceListing[], source: DanceSource<T>) {
    if (!source.thumbnail) return
    for (const dance of dances) {
      if (this.thumbnails.has(dance.id)) continue
      source.thumbnail(dance).then(
        (texture) => {
          // Kept by dance id, so it's still right if the list has been shown again since.
          if (texture) this.thumbnails.set(dance.id, texture)
        },
        () => {},
      )
    }
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
