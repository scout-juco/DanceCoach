import { AddressInfo } from "node:net"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { BEAT_SEC, LinkClient, LinkCommand, LinkTransport } from "../DanceCoachLens/Assets/Scripts/Core/LinkClient"
import { buildSpecsState, SpecsState } from "../DanceCoachLens/Assets/Scripts/Core/LinkState"
import { decodeLink, encodeLink } from "../DanceCoachLens/Assets/Scripts/Core/SettingsStore"
import { pairCodeText } from "../DanceCoachLens/Assets/Scripts/Core/DialogCopy"
import { cleanState } from "../server/link"
import { createIngestServer } from "../server/ingestServer"

const flush = () => new Promise((r) => setTimeout(r, 0))
const state: SpecsState = { danceId: "d1", section: 2, mode: "pose", speed: 0.75, mirror: true, running: false, lookbackRecording: false, finalRecording: false, progress: { d1: [1, 2] } }

class FakeTransport implements LinkTransport {
  posts: { url: string; body: any }[] = []
  replies: unknown[] = []
  fail = false
  async postJson(url: string, body: unknown) {
    this.posts.push({ url, body })
    if (this.fail) throw new Error("offline")
    return this.replies.length > 1 ? this.replies.shift() : this.replies[0]
  }
}

const reply = (over: object = {}) => ({ paired: false, pairCode: "4729", phoneConnected: false, commands: [], ...over })

function setup(saved: { specsId: string; paired: boolean } | null = null) {
  const t = new FakeTransport()
  t.replies = [reply()]
  const saves: { specsId: string; paired: boolean }[] = []
  const client = new LinkClient("http://server/", t, saved, () => "specs-new")
  client.onSave = (s) => saves.push(s)
  const commands: LinkCommand[] = []
  client.onCommand = (c) => commands.push(c)
  return { t, client, commands, saves }
}

/** One beat: ticks past the interval, lets the answer land. */
async function beat(client: LinkClient, s: SpecsState = state) {
  client.tick(BEAT_SEC, () => s)
  await flush()
}

describe("LinkClient beats", () => {
  it("beats at once, then every 500 ms, carrying the state and the Specs id", async () => {
    const { t, client } = setup()
    client.tick(0.016, () => state)
    expect(t.posts).toHaveLength(1)
    expect(t.posts[0].url).toBe("http://server/link/specs/beat")
    expect(t.posts[0].body).toEqual({ specsId: "specs-new", state })
    await flush()
    client.tick(0.3, () => state)
    expect(t.posts).toHaveLength(1)
    client.tick(0.3, () => state)
    expect(t.posts).toHaveLength(2)
  })

  it("never has two beats in flight", async () => {
    const { t, client } = setup()
    client.tick(BEAT_SEC, () => state)
    client.tick(BEAT_SEC, () => state)
    expect(t.posts).toHaveLength(1)
    await flush()
    client.tick(BEAT_SEC, () => state)
    expect(t.posts).toHaveLength(2)
  })

  it("reads the code, paired and phoneConnected from the reply", async () => {
    const { client } = setup()
    expect(client.view).toEqual({ pairCode: null, paired: null, phoneConnected: false })
    await beat(client)
    expect(client.view).toEqual({ pairCode: "4729", paired: false, phoneConnected: false })
  })

  it("once paired, the code goes", async () => {
    const { t, client } = setup()
    t.replies = [reply(), reply({ paired: true, pairCode: undefined, phoneConnected: true })]
    await beat(client)
    await beat(client)
    expect(client.view).toEqual({ pairCode: null, paired: true, phoneConnected: true })
  })

  it("keeps going after the network fails", async () => {
    const { t, client } = setup()
    t.fail = true
    await beat(client)
    await beat(client)
    expect(t.posts).toHaveLength(2)
    t.fail = false
    await beat(client)
    expect(client.view.paired).toBe(false)
  })
})

describe("LinkClient commands", () => {
  const open: LinkCommand = { id: "c1", type: "open-dance", danceId: "d1", section: 3 }
  const end: LinkCommand = { id: "c2", type: "end-session" }

  it("hands each command over once and acks it on the next beat", async () => {
    const { t, client, commands } = setup()
    t.replies = [reply({ paired: true, commands: [open] }), reply({ paired: true, commands: [open] }), reply({ paired: true })]
    await beat(client)
    expect(commands).toEqual([open])
    await beat(client)
    expect(t.posts[1].body.ack).toBe("c1")
    expect(commands).toEqual([open])
    await beat(client)
    expect(t.posts[2].body.ack).toBeUndefined()
  })

  it("acks several commands one a beat, and runs both", async () => {
    const { t, client, commands } = setup()
    t.replies = [reply({ paired: true, commands: [open, end] }), reply({ paired: true })]
    await beat(client)
    expect(commands).toEqual([open, end])
    await beat(client)
    await beat(client)
    expect([t.posts[1].body.ack, t.posts[2].body.ack]).toEqual(["c1", "c2"])
  })

  it("an open-dance without a section comes through without one", async () => {
    const { t, client, commands } = setup()
    t.replies = [reply({ paired: true, commands: [{ id: "c9", type: "open-dance", danceId: "d2" }] })]
    await beat(client)
    expect(commands).toEqual([{ id: "c9", type: "open-dance", danceId: "d2" }])
  })

  it("ignores malformed replies and malformed commands", async () => {
    const { t, client, commands } = setup()
    for (const bad of [null, "nope", 7, {}, { paired: "yes", commands: [] }, { paired: true }, { paired: true, commands: "x" }]) {
      t.replies = [bad]
      await beat(client)
    }
    expect(client.view).toEqual({ pairCode: null, paired: null, phoneConnected: false })
    expect(commands).toEqual([])
    t.replies = [
      reply({
        paired: true,
        commands: [null, {}, { id: "x" }, { id: "x", type: "dance" }, { id: "y", type: "open-dance" }, { id: "z", type: "open-dance", danceId: "d", section: -1 }, { id: "w", type: "open-dance", danceId: "d", section: 1.5 }, end],
      }),
    ]
    await beat(client)
    expect(commands).toEqual([end])
  })
})

describe("LinkClient identity", () => {
  it("makes and saves a Specs id the first time, and keeps a saved one", () => {
    const first = setup()
    expect(first.client.id).toBe("specs-new")
    first.client.tick(0.016, () => state)
    expect(first.saves).toEqual([{ specsId: "specs-new", paired: false }])
    const again = setup({ specsId: "specs-old", paired: true })
    again.client.tick(0.016, () => state)
    expect(again.client.id).toBe("specs-old")
    expect(again.saves).toEqual([])
    expect(again.client.view.paired).toBe(true)
  })

  it("saves the paired state when it changes, and not otherwise", async () => {
    const { t, client, saves } = setup({ specsId: "s", paired: false })
    t.replies = [reply(), reply({ paired: true }), reply({ paired: true }), reply({ paired: false })]
    await beat(client)
    await beat(client)
    await beat(client)
    await beat(client)
    expect(saves).toEqual([
      { specsId: "s", paired: true },
      { specsId: "s", paired: false },
    ])
  })

  it("a saved pairing shows no card before the server answers", () => {
    const { client } = setup({ specsId: "s", paired: true })
    expect(client.view).toEqual({ pairCode: null, paired: true, phoneConnected: false })
  })

  it("the link survives a round trip through storage", () => {
    expect(decodeLink(encodeLink({ specsId: "s1", paired: true }))).toEqual({ specsId: "s1", paired: true })
    for (const bad of [null, undefined, "", "{", "[]", '{"paired":true}', '{"specsId":3}']) expect(decodeLink(bad)).toBeNull()
  })
})

describe("buildSpecsState", () => {
  const base = { mode: "Playthrough" as const, section: 3, wholeRoutine: false, speed: 0.75 as number, mirror: true, running: true, lookbackRecording: false, danceIds: ["a", "b"], savedProgress: (id: string) => (id === "a" ? "[1,3]" : null) }

  it("reports progress for every dance it knows, the way the picker's pills read it", () => {
    const s = buildSpecsState({ ...base, danceId: "a" })
    expect(s.progress).toEqual({ a: [1, 3], b: [] })
    expect(s).toMatchObject({ danceId: "a", section: 3, mode: "playthrough", speed: 0.75, mirror: true, running: true, finalRecording: false })
  })

  it("the whole routine is section 0, and Pose and Lookback report their own section", () => {
    expect(buildSpecsState({ ...base, danceId: "a", wholeRoutine: true }).section).toBe(0)
    expect(buildSpecsState({ ...base, danceId: "a", mode: "Pose", modeSection: 4 })).toMatchObject({ mode: "pose", section: 4 })
    expect(buildSpecsState({ ...base, danceId: "a", mode: "Lookback", modeSection: 0, lookbackRecording: true })).toMatchObject({ mode: "lookback", section: 0, lookbackRecording: true })
  })

  it("while picking, nothing is open or running", () => {
    expect(buildSpecsState({ ...base })).toMatchObject({ danceId: undefined, section: 0, running: false, lookbackRecording: false })
  })

  it("the server accepts what it builds", () => {
    const s = buildSpecsState({ ...base, danceId: "a" })
    expect(cleanState(JSON.parse(JSON.stringify(s)))).toEqual(s)
    const picking = buildSpecsState({ ...base })
    expect(cleanState(JSON.parse(JSON.stringify(picking)))).toEqual({ ...picking, danceId: undefined })
  })

  it("the pairing code is spaced for reading", () => {
    expect(pairCodeText("4729")).toBe("4 7 2 9")
  })
})

describe("LinkClient against the real server", () => {
  const work = mkdtempSync(join(tmpdir(), "linkclient-"))
  const server = createIngestServer({ storageDir: work })
  let base = ""
  const http: LinkTransport = {
    async postJson(url, body) {
      const r = await fetch(url, { method: "POST", body: JSON.stringify(body) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
  }
  beforeAll(async () => {
    await new Promise<void>((ok) => server.listen(0, ok))
    base = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => {
    server.close()
    rmSync(work, { recursive: true, force: true })
  })

  it("shows a code, pairs, receives a command and acks it", async () => {
    const client = new LinkClient(base, http, null, () => "specs-live")
    const commands: LinkCommand[] = []
    client.onCommand = (c) => commands.push(c)
    // A beat, then wait for its answer (the client has none in flight again once it lands).
    const live = async () => {
      let answered = false
      const before = JSON.stringify(client.view) + commands.length
      client.tick(BEAT_SEC, () => state)
      for (let i = 0; i < 40 && !answered; i++) {
        await new Promise((r) => setTimeout(r, 25))
        answered = JSON.stringify(client.view) + commands.length !== before || i >= 6
      }
    }
    await live()
    const code = client.view.pairCode
    expect(code).toMatch(/^\d{4}$/)
    const { phoneToken } = await (await fetch(`${base}/link/pair`, { method: "POST", body: JSON.stringify({ code }) })).json()
    await live()
    expect(client.view).toMatchObject({ pairCode: null, paired: true })
    const sent = await fetch(`${base}/link/phone/command`, { method: "POST", headers: { Authorization: `Bearer ${phoneToken}` }, body: JSON.stringify({ type: "open-dance", danceId: "d1", section: 2 }) })
    expect(sent.status).toBe(201)
    await live()
    expect(commands).toMatchObject([{ type: "open-dance", danceId: "d1", section: 2 }])
    await live()
    await live()
    expect(commands).toHaveLength(1)
    const phone = await (await fetch(`${base}/link/phone/beat`, { headers: { Authorization: `Bearer ${phoneToken}` } })).json()
    expect(phone).toMatchObject({ specs: "connected", state: { danceId: "d1", progress: { d1: [1, 2] } } })
  })
})
