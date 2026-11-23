import { describe, expect, it } from "vitest"
import { Take, TakesClient, TakesTransport } from "../DanceCoachLens/Assets/Scripts/Core/TakesClient"

const BASE = "https://dance.example"

const take = (number: number, speed = 1): Take => ({ name: `s2-t${number}`, section: 2, speed, mirror: false, number })

/** A fake fetch: serves JSON by URL, and records every request. */
function fakeTransport(json: Record<string, unknown>) {
  const requests: { method: string; url: string; body?: unknown }[] = []
  const transport: TakesTransport = {
    getJson: async (url) => {
      requests.push({ method: "GET", url })
      if (!(url in json)) throw new Error(`HTTP 404 for ${url}`)
      return json[url]
    },
    postJson: async (url, body) => {
      requests.push({ method: "POST", url, body })
      if (!(url in json)) throw new Error(`HTTP 404 for ${url}`)
      return json[url]
    },
    loadClip: async (url) => {
      requests.push({ method: "GET", url })
      return { url }
    },
  }
  return { transport, requests }
}

describe("TakesClient: listing", () => {
  it("lists a section's takes, oldest first", async () => {
    const { transport, requests } = fakeTransport({ [`${BASE}/dances/abc/takes?section=2`]: [take(3, 0.75), take(1), take(2)] })
    const takes = await new TakesClient(BASE, transport).list("abc", 2)
    expect(takes.map((t) => t.number)).toEqual([1, 2, 3])
    expect(takes[2]).toEqual(take(3, 0.75))
    expect(requests).toEqual([{ method: "GET", url: `${BASE}/dances/abc/takes?section=2` }])
  })

  it("ignores a trailing slash on the server URL and the server's extra fields", async () => {
    const { transport } = fakeTransport({ [`${BASE}/dances/abc/takes?section=2`]: [{ ...take(1), created: "now", offset: 0.4 }] })
    expect(await new TakesClient(`${BASE}//`, transport).list("abc", 2)).toEqual([take(1)])
  })

  it("lists nothing for a section with no takes", async () => {
    const { transport } = fakeTransport({ [`${BASE}/dances/abc/takes?section=1`]: [] })
    expect(await new TakesClient(BASE, transport).list("abc", 1)).toEqual([])
  })

  it("rejects a list that isn't a list or has a malformed take", async () => {
    const bad = fakeTransport({ [`${BASE}/dances/abc/takes?section=2`]: { error: "no" } })
    await expect(new TakesClient(BASE, bad.transport).list("abc", 2)).rejects.toThrow("isn't a list")
    const malformed = fakeTransport({ [`${BASE}/dances/abc/takes?section=2`]: [{ name: "x" }] })
    await expect(new TakesClient(BASE, malformed.transport).list("abc", 2)).rejects.toThrow("malformed")
  })

  it("rejects when the server fails", async () => {
    await expect(new TakesClient(BASE, fakeTransport({}).transport).list("abc", 2)).rejects.toThrow("404")
  })
})

describe("TakesClient: recorder status", () => {
  it("reads whether the phone is connected, with no session", async () => {
    const { transport } = fakeTransport({ [`${BASE}/recorder/status`]: { phoneConnected: true, session: null } })
    expect(await new TakesClient(BASE, transport).status()).toEqual({ phoneConnected: true, session: null })
  })

  it("reads the session's state, take and reason", async () => {
    const ready = fakeTransport({ [`${BASE}/recorder/status`]: { phoneConnected: true, session: { id: "s1", state: "ready", take: take(4) } } })
    expect(await new TakesClient(BASE, ready.transport).status()).toEqual({ phoneConnected: true, session: { id: "s1", state: "ready", take: take(4), reason: undefined } })
    const failed = fakeTransport({ [`${BASE}/recorder/status`]: { phoneConnected: false, session: { id: "s1", state: "failed", reason: "Record again." } } })
    expect((await new TakesClient(BASE, failed.transport).status()).session).toMatchObject({ state: "failed", reason: "Record again." })
  })

  it("rejects a status that isn't one", async () => {
    const bad = fakeTransport({ [`${BASE}/recorder/status`]: { session: null } })
    await expect(new TakesClient(BASE, bad.transport).status()).rejects.toThrow("malformed")
    const state = fakeTransport({ [`${BASE}/recorder/status`]: { phoneConnected: true, session: { id: "s1", state: "dancing" } } })
    await expect(new TakesClient(BASE, state.transport).status()).rejects.toThrow("malformed")
  })
})

describe("TakesClient: requests' shapes", () => {
  it("arms a take with the section, speed and mirror, and returns the session id", async () => {
    const { transport, requests } = fakeTransport({ [`${BASE}/dances/abc/takes/session`]: { id: "s9", state: "armed" } })
    expect(await new TakesClient(BASE, transport).arm("abc", { section: 2, speed: 0.75, mirror: true })).toBe("s9")
    expect(requests).toEqual([{ method: "POST", url: `${BASE}/dances/abc/takes/session`, body: { section: 2, speed: 0.75, mirror: true } }])
  })

  it("starts and stops a session", async () => {
    const { transport, requests } = fakeTransport({ [`${BASE}/takes/session/s9/start`]: {}, [`${BASE}/takes/session/s9/stop`]: {} })
    const client = new TakesClient(BASE, transport)
    await client.start("s9", 4.2)
    await client.stop("s9")
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([`POST ${BASE}/takes/session/s9/start`, `POST ${BASE}/takes/session/s9/stop`])
  })

  it("downloads a take like a clip", async () => {
    const { transport, requests } = fakeTransport({})
    await new TakesClient(BASE, transport).loadTake("abc", take(3))
    expect(requests).toEqual([{ method: "GET", url: `${BASE}/dances/abc/takes/s2-t3.mp4` }])
  })

  it("points at a take's video", () => {
    expect(new TakesClient(BASE, fakeTransport({}).transport).takeUrl("abc", take(3))).toBe(`${BASE}/dances/abc/takes/s2-t3.mp4`)
  })
})
