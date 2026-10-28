import { describe, expect, it } from "vitest"
import { DanceListing, DanceSource, LoadedDance } from "../DanceCoachLens/Assets/Scripts/Core/DanceSource"
import { DancePicker, LIST_TIMEOUT_SEC, LOAD_TIMEOUT_SEC } from "../DanceCoachLens/Assets/Scripts/Core/DancePicker"
import { makeDance } from "./fixtures"

const flush = () => new Promise((r) => setTimeout(r, 0))

/** A source whose answers the test releases by hand. */
class ManualSource implements DanceSource<never> {
  lists: { resolve: (d: DanceListing[]) => void; reject: (e: Error) => void }[] = []
  loads: { id: string; resolve: (l: LoadedDance<never>) => void; reject: (e: Error) => void }[] = []
  list() {
    return new Promise<DanceListing[]>((resolve, reject) => this.lists.push({ resolve, reject }))
  }
  load(id: string) {
    return new Promise<LoadedDance<never>>((resolve, reject) => this.loads.push({ id, resolve, reject }))
  }
}

const loaded = (id: string): LoadedDance<never> => ({ dance: makeDance({ id }), clips: null })
const listing = (id: string, title = id): DanceListing => ({ id, title, difficulty: "Beginner" })

function setup() {
  const remote = new ManualSource()
  const fallback = new ManualSource()
  const picker = new DancePicker<never>(remote, fallback)
  const got: LoadedDance<never>[] = []
  picker.onLoaded = (l) => got.push(l)
  return { remote, fallback, picker, got }
}

/** Opens the picker and lists the given dances from the server. */
async function listed(ids: string[]) {
  const s = setup()
  s.picker.open()
  s.remote.lists[0].resolve(ids.map((id) => listing(id, `Dance ${id.toUpperCase()}`)))
  await flush()
  return s
}

/** Opens the picker with the server unreachable and the fallback offering the test dance. */
async function offline() {
  const s = setup()
  s.picker.open()
  s.remote.lists[0].reject(new Error("unreachable"))
  await flush()
  s.fallback.lists[0].resolve([listing("test-dance", "Test dance")])
  await flush()
  return s
}

describe("DancePicker", () => {
  it("shows loading, then the server's dances", async () => {
    const { remote, picker } = setup()
    expect(picker.view).toBeNull()
    picker.open()
    expect(picker.view).toEqual({ kind: "loadingList" })
    remote.lists[0].resolve([listing("a"), listing("b")])
    await flush()
    expect(picker.view).toEqual({ kind: "list", dances: [listing("a"), listing("b")], offline: false })
  })

  it("loads the dance picked and hands it over", async () => {
    const { remote, picker, got } = await listed(["a"])
    picker.pick("a")
    expect(picker.view).toEqual({ kind: "loadingDance", title: "Dance A" })
    remote.loads[0].resolve(loaded("a"))
    await flush()
    expect(got.map((l) => l.dance.id)).toEqual(["a"])
    expect(picker.view).toBeNull()
  })

  it("ignores a pick that isn't on the list, or made before there is one", async () => {
    const { remote, picker } = setup()
    picker.pick("a")
    expect(picker.view).toBeNull()
    picker.open()
    remote.lists[0].resolve([listing("a")])
    await flush()
    picker.pick("zzz")
    expect(remote.loads).toHaveLength(0)
    expect(picker.view?.kind).toBe("list")
  })

  it("shows could-not-load when the dance fails, and retry loads it again", async () => {
    const { remote, picker, got } = await listed(["a"])
    picker.pick("a")
    remote.loads[0].reject(new Error("boom"))
    await flush()
    expect(picker.view).toEqual({ kind: "failed", title: "Dance A" })
    picker.retry()
    expect(picker.view).toEqual({ kind: "loadingDance", title: "Dance A" })
    remote.loads[1].resolve(loaded("a"))
    await flush()
    expect(got).toHaveLength(1)
  })

  it("goes back to the list from a failure", async () => {
    const { remote, picker } = await listed(["a", "b"])
    picker.pick("a")
    remote.loads[0].reject(new Error("boom"))
    await flush()
    picker.back()
    expect(picker.view).toMatchObject({ kind: "list", offline: false })
    picker.pick("b")
    expect(remote.loads.map((l) => l.id)).toEqual(["a", "b"])
  })

  it("times out a slow load, and ignores the answer when it finally comes", async () => {
    const { remote, picker, got } = await listed(["a"])
    picker.pick("a")
    picker.tick(LOAD_TIMEOUT_SEC - 1)
    expect(picker.view?.kind).toBe("loadingDance")
    picker.tick(1)
    expect(picker.view).toEqual({ kind: "failed", title: "Dance A" })
    remote.loads[0].resolve(loaded("a"))
    await flush()
    expect(got).toHaveLength(0)
    expect(picker.view?.kind).toBe("failed")
  })

  it("falls back to the offline dances when the server can't be reached", async () => {
    const { picker } = await offline()
    expect(picker.view).toEqual({ kind: "list", dances: [listing("test-dance", "Test dance")], offline: true })
  })

  it("falls back when the list is too slow, and ignores the late list", async () => {
    const { remote, fallback, picker } = setup()
    picker.open()
    picker.tick(LIST_TIMEOUT_SEC)
    fallback.lists[0].resolve([listing("test-dance")])
    await flush()
    expect(picker.view).toEqual({ kind: "list", dances: [listing("test-dance")], offline: true })
    remote.lists[0].resolve([listing("late")])
    await flush()
    expect(picker.view).toMatchObject({ kind: "list", offline: true })
    picker.tick(100)
    expect(picker.view?.kind).toBe("list")
  })

  it("loads an offline dance from the fallback, not the server", async () => {
    const { remote, fallback, picker, got } = await offline()
    picker.pick("test-dance")
    expect(remote.loads).toHaveLength(0)
    fallback.loads[0].resolve(loaded("test-dance"))
    await flush()
    expect(got.map((l) => l.dance.id)).toEqual(["test-dance"])
  })

  it("retries the server from the offline list", async () => {
    const { remote, picker } = await offline()
    picker.retry()
    expect(picker.view).toEqual({ kind: "loadingList" })
    remote.lists[1].resolve([listing("a")])
    await flush()
    expect(picker.view).toEqual({ kind: "list", dances: [listing("a")], offline: false })
  })

  it("lists afresh when opened again to pick another dance", async () => {
    const { remote, picker } = await listed(["a"])
    picker.pick("a")
    remote.loads[0].resolve(loaded("a"))
    await flush()
    picker.open()
    remote.lists[1].resolve([listing("a"), listing("b")])
    await flush()
    expect(picker.view).toMatchObject({ kind: "list", offline: false })
    expect((picker.view as { dances: unknown[] }).dances).toHaveLength(2)
  })
})
