import { describe, expect, it } from "vitest"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { MAX_CONCURRENT_DOWNLOADS, RemoteClip, RemoteDanceSource, RemoteTransport } from "../DanceCoachLens/Assets/Scripts/Core/RemoteDanceSource"
import { VIDEO_STATUS, VideoPlayer } from "../DanceCoachLens/Assets/Scripts/Core/VideoDriver"
import { stillNames } from "../DanceCoachLens/Assets/Scripts/Core/StillPlan"
import { makeDance } from "./fixtures"

const BASE = "https://dance.example"
const dance = makeDance({ id: "abc123abc123", video: "abc123abc123.mp4" })

function fakePlayer(): VideoPlayer {
  return { status: VIDEO_STATUS.Stopped, currentTime: 0, lastFrameTime: 0, playbackRate: 1, play() {}, pause() {}, resume() {}, stop() {}, seek: () => true }
}

/** A fake fetch: serves the given JSON by URL and makes a texture named after each clip file. */
function fakeTransport(json: Record<string, unknown>, failClip?: string, failStill?: string) {
  const requested: string[] = []
  const transport: RemoteTransport<string> = {
    getJson: async (url) => {
      requested.push(url)
      if (!(url in json)) throw new Error(`HTTP 404 for ${url}`)
      return json[url]
    },
    postJson: async () => {
      throw new Error("not used")
    },
    loadClip: async (url): Promise<RemoteClip<string>> => {
      requested.push(url)
      if (failClip && url.endsWith(failClip)) throw new Error("download failed")
      return { player: fakePlayer(), texture: url.split("/").pop()! }
    },
    loadStill: async (url) => {
      requested.push(url)
      if (failStill && url.endsWith(failStill)) throw new Error("still download failed")
      return url.split("/").pop()!
    },
  }
  return { transport, requested }
}

const served = { [`${BASE}/dances`]: [{ id: dance.id, title: dance.title, difficulty: "Intermediate" }], [`${BASE}/dances/${dance.id}/package`]: dance }

describe("RemoteDanceSource", () => {
  it("lists the server's ready dances by title and difficulty", async () => {
    const source = new RemoteDanceSource(BASE, fakeTransport(served).transport)
    expect(await source.list()).toEqual([{ id: dance.id, title: dance.title, difficulty: "Intermediate" }])
  })

  it("ignores a trailing slash on the server URL", async () => {
    const { transport, requested } = fakeTransport(served)
    await new RemoteDanceSource(`${BASE}//`, transport).list()
    expect(requested).toEqual([`${BASE}/dances`])
  })

  it("rejects a list it can't read", async () => {
    await expect(new RemoteDanceSource(BASE, fakeTransport({ [`${BASE}/dances`]: { nope: 1 } }).transport).list()).rejects.toThrow()
    await expect(new RemoteDanceSource(BASE, fakeTransport({ [`${BASE}/dances`]: [{ id: 1 }] }).transport).list()).rejects.toThrow(/malformed/)
  })

  it("loads the package and maps each clip to the plan by name", async () => {
    const { transport, requested } = fakeTransport(served)
    const loaded = await new RemoteDanceSource(BASE, transport).load(dance.id)
    const plan = planClips(dance)
    expect(loaded.dance).toEqual(dance)
    expect(loaded.clips!.players.map((p) => p.clip)).toEqual(plan)
    expect(loaded.clips!.textures).toEqual(plan.map((c) => `${clipAssetName(dance.video, c.id)}.mp4`))
    expect(requested).toContain(`${BASE}/dances/${dance.id}/clips/${clipAssetName(dance.video, "top")}.mp4`)
  })

  it("rejects when the package can't be fetched", async () => {
    await expect(new RemoteDanceSource(BASE, fakeTransport({}).transport).load(dance.id)).rejects.toThrow(/404/)
  })

  it("rejects when the package is invalid", async () => {
    const bad = { ...served, [`${BASE}/dances/${dance.id}/package`]: { id: dance.id } }
    await expect(new RemoteDanceSource(BASE, fakeTransport(bad).transport).load(dance.id)).rejects.toThrow(/invalid/)
  })

  it("rejects when any clip fails to download", async () => {
    const { transport } = fakeTransport(served, `${clipAssetName(dance.video, "s2")}.mp4`)
    await expect(new RemoteDanceSource(BASE, transport).load(dance.id)).rejects.toThrow(/download failed/)
  })
  describe("stills", () => {
    const withStills = makeDance({ id: dance.id, video: dance.video })
    const pkg = { ...withStills, stills: stillNames(withStills) }
    const json = { ...served, [`${BASE}/dances/${dance.id}/package`]: pkg }

    it("downloads every still the package lists, grouped by section and step", async () => {
      const { transport, requested } = fakeTransport(json)
      const loaded = await new RemoteDanceSource(BASE, transport).load(dance.id)
      expect(loaded.stills).toEqual(pkg.stills)
      expect(loaded.stills!.length).toBe(3)
      expect(loaded.stills![0]).toHaveLength(16)
      expect(requested).toContain(`${BASE}/dances/${dance.id}/stills/${pkg.stills[1][3]}`)
    })

    it("has no stills for a dance whose package lists none", async () => {
      const loaded = await new RemoteDanceSource(BASE, fakeTransport(served).transport).load(dance.id)
      expect(loaded.stills).toBeNull()
    })

    it("rejects when any still fails to download", async () => {
      const { transport } = fakeTransport(json, undefined, pkg.stills[2][15])
      await expect(new RemoteDanceSource(BASE, transport).load(dance.id)).rejects.toThrow(/still download failed/)
    })

    it("downloads only a few at a time", async () => {
      let active = 0
      let peak = 0
      const { transport } = fakeTransport(json)
      const loadStill = transport.loadStill
      transport.loadStill = async (url) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 1))
        active--
        return loadStill(url)
      }
      await new RemoteDanceSource(BASE, transport).load(dance.id)
      expect(peak).toBeGreaterThan(1)
      expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_DOWNLOADS)
    })

    it("reports how much is in as the package, clips and stills arrive", async () => {
      const seen: number[] = []
      await new RemoteDanceSource(BASE, fakeTransport(json).transport).load(dance.id, (f) => seen.push(f))
      expect(seen[0]).toBe(0)
      expect(seen[seen.length - 1]).toBe(1)
      expect(seen.every((f, i) => i === 0 || f > seen[i - 1])).toBe(true)
    })

    it("tries a failed download again before giving up", async () => {
      const { transport } = fakeTransport(json)
      const loadStill = transport.loadStill
      let failures = 1
      transport.loadStill = async (url) => {
        if (url.endsWith(pkg.stills[0][0]) && failures-- > 0) throw new Error("dropped")
        return loadStill(url)
      }
      const loaded = await new RemoteDanceSource(BASE, transport).load(dance.id)
      expect(loaded.stills).toEqual(pkg.stills)
    })
  })
})
