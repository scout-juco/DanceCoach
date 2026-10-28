import { describe, expect, it } from "vitest"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { RemoteClip, RemoteDanceSource, RemoteTransport } from "../DanceCoachLens/Assets/Scripts/Core/RemoteDanceSource"
import { VIDEO_STATUS, VideoPlayer } from "../DanceCoachLens/Assets/Scripts/Core/VideoDriver"
import { makeDance } from "./fixtures"

const BASE = "https://dance.example"
const dance = makeDance({ id: "abc123abc123", video: "abc123abc123.mp4" })

function fakePlayer(): VideoPlayer {
  return { status: VIDEO_STATUS.Stopped, currentTime: 0, lastFrameTime: 0, playbackRate: 1, play() {}, pause() {}, resume() {}, stop() {}, seek: () => true }
}

/** A fake fetch: serves the given JSON by URL and makes a texture named after each clip file. */
function fakeTransport(json: Record<string, unknown>, failClip?: string) {
  const requested: string[] = []
  const transport: RemoteTransport<string> = {
    getJson: async (url) => {
      requested.push(url)
      if (!(url in json)) throw new Error(`HTTP 404 for ${url}`)
      return json[url]
    },
    loadClip: async (url): Promise<RemoteClip<string>> => {
      requested.push(url)
      if (failClip && url.endsWith(failClip)) throw new Error("download failed")
      return { player: fakePlayer(), texture: url.split("/").pop()! }
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
})
