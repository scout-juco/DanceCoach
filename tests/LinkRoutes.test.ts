import { mkdtempSync, rmSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createIngestServer } from "../server/ingestServer"

const work = mkdtempSync(join(tmpdir(), "link-"))
let t = 5_000_000
const server = createIngestServer({ storageDir: work, now: () => t })
let base = ""

beforeAll(async () => {
  await new Promise<void>((ok) => server.listen(0, ok))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.close()
  rmSync(work, { recursive: true, force: true })
})

const call = (method: string, path: string, body?: unknown, token?: string) =>
  fetch(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: token ? { Authorization: `Bearer ${token}` } : {} })
const specsState = { section: 2, mode: "pose", speed: 0.75, mirror: false, running: true, lookbackRecording: false, finalRecording: false, progress: { d1: [1] } }

describe("the link routes", () => {
  it("before anyone is paired, the old recorder routes and dance writes work as they did", async () => {
    expect(await (await call("GET", "/recorder/state")).json()).toMatchObject({ session: null })
    expect((await (await call("GET", "/recorder/status")).json()).phoneConnected).toBe(true)
    t += 4000
    expect((await (await call("GET", "/recorder/status")).json()).phoneConnected).toBe(false)
    expect((await call("DELETE", "/dances/abcdefabcdef")).status).toBe(404)
  })

  it("pair, beat, command, ack round trip", async () => {
    const first = await (await call("POST", "/link/specs/beat", { specsId: "s1", state: specsState })).json()
    expect(first).toMatchObject({ paired: false, commands: [] })
    expect(first.pairCode).toMatch(/^\d{4}$/)

    const wrong = await call("POST", "/link/pair", { code: first.pairCode === "0000" ? "0001" : "0000" })
    expect(wrong.status).toBe(422)
    expect((await wrong.json()).error).toMatch(/doesn't match/)

    const { phoneToken } = await (await call("POST", "/link/pair", { code: first.pairCode })).json()
    const beat = await (await call("GET", "/link/phone/beat", undefined, phoneToken)).json()
    expect(beat).toMatchObject({ specs: "connected", state: { section: 2, mode: "pose", progress: { d1: [1] } }, session: null })

    const sent = await call("POST", "/link/phone/command", { type: "open-dance", danceId: "d1", section: 3 }, phoneToken)
    expect(sent.status).toBe(201)
    const cmd = await sent.json()

    const next = await (await call("POST", "/link/specs/beat", { specsId: "s1", state: specsState })).json()
    expect(next).toMatchObject({ paired: true, phoneConnected: true, commands: [cmd] })
    expect(next.pairCode).toBeUndefined()
    const acked = await (await call("POST", "/link/specs/beat", { specsId: "s1", state: specsState, ack: cmd.id })).json()
    expect(acked.commands).toEqual([])

    t += 4000
    expect(await (await call("GET", "/link/phone/beat", undefined, phoneToken)).json()).toMatchObject({ specs: "not-connected", state: { section: 2 } })
  })

  it("phone writes without a token get 401, with it they pass", async () => {
    const { pairCode } = await (await call("POST", "/link/specs/beat", { specsId: "s9", state: specsState })).json()
    const { phoneToken } = await (await call("POST", "/link/pair", { code: pairCode })).json()
    expect((await call("POST", "/link/phone/command", { type: "end-session" })).status).toBe(401)
    expect((await call("POST", "/link/phone/command", { type: "end-session" }, "wrong")).status).toBe(401)
    expect((await call("DELETE", "/dances/abcdefabcdef")).status).toBe(401)
    expect((await call("PUT", "/dances/abcdefabcdef", {})).status).toBe(401)
    expect((await call("DELETE", "/dances/abcdefabcdef/takes/s1-t1")).status).toBe(401)
    expect((await call("DELETE", "/dances/abcdefabcdef", undefined, phoneToken)).status).toBe(404)
    expect((await call("POST", "/link/phone/command", { type: "nope" }, phoneToken)).status).toBe(422)
  })

  it("a phone with a bad token is told it is unpaired, and a Specs beat needs an id", async () => {
    expect(await (await call("GET", "/link/phone/beat", undefined, "wrong")).json()).toMatchObject({ specs: "unpaired" })
    expect((await call("POST", "/link/specs/beat", { state: specsState })).status).toBe(422)
  })
})
