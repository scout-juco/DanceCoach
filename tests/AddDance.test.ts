import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createIngestServer } from "../server/ingestServer"
import { addFromFile, addFromLink, difficultyDots, linkFromShare, processingStep, tileMeta, PROCESSING_FAILED } from "../server/page/phone/add"
import { NETWORK_ERROR } from "../server/page/phone/pairing"
import { resolveRoute } from "../server/page/phone/router"
import { makeDance } from "./fixtures"

const reply = (status: number, body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch

describe("a trending tile", () => {
  it("shows dots for the difficulty", () => {
    expect(difficultyDots("Beginner")).toBe("●○○")
    expect(difficultyDots("Intermediate")).toBe("●●○")
    expect(difficultyDots("Advanced")).toBe("●●●")
  })
  it("says Easy · 30s", () => {
    expect(tileMeta({ difficulty: "Beginner", lengthSec: 29.6 })).toBe("Easy · 30s")
    expect(tileMeta({ difficulty: "Spicy" })).toBe("Spicy")
  })
})

describe("the link in a share", () => {
  it("is found in the url, or in the text with words around it", () => {
    expect(linkFromShare("?url=https%3A%2F%2Fvm.tiktok.com%2Fabc%2F")).toBe("https://vm.tiktok.com/abc/")
    expect(linkFromShare("?title=Look&text=Check%20this%20out%20https%3A%2F%2Fvm.tiktok.com%2Fabc%2F%20wow")).toBe("https://vm.tiktok.com/abc/")
  })
  it("is nothing when the share has no link", () => {
    expect(linkFromShare("")).toBeUndefined()
    expect(linkFromShare("?text=just%20words")).toBeUndefined()
  })
})

describe("adding from a link or a file", () => {
  it("gives the new dance's id", async () => {
    expect(await addFromLink(" https://tiktok.com/x ", reply(201, { package: { id: "abc" }, confidence: 1 }))).toEqual({ ok: true, id: "abc" })
    expect(await addFromFile(new File(["x"], "a.mp4"), reply(201, { package: { id: "def" } }))).toEqual({ ok: true, id: "def" })
  })
  it("shows the server's readable error", async () => {
    expect(await addFromLink("nope", reply(422, { error: "That doesn't look like a link." }))).toEqual({ ok: false, error: "That doesn't look like a link." })
  })
  it("says it can't reach the server, or that something went wrong", async () => {
    expect(await addFromLink("x", (() => Promise.reject(new Error("down"))) as unknown as typeof fetch)).toEqual({ ok: false, error: NETWORK_ERROR })
    expect(await addFromLink("x", reply(500, "oops"))).toMatchObject({ ok: false })
  })
  it("sends the link trimmed, and the file under its name", async () => {
    const seen: [string, RequestInit | undefined][] = []
    const spy = ((url: string, init?: RequestInit) => (seen.push([url, init]), Promise.resolve(new Response(JSON.stringify({ package: { id: "a" } }), { status: 201 })))) as unknown as typeof fetch
    await addFromLink(" https://tiktok.com/x ", spy)
    await addFromFile(new File(["x"], "my dance.mp4"), spy)
    expect(seen[0][0]).toBe("/dances/link")
    expect(JSON.parse(String(seen[0][1]?.body))).toEqual({ url: "https://tiktok.com/x" })
    expect(seen[1][0]).toBe("/dances?name=my%20dance.mp4")
  })
})

describe("the processing screen's step", () => {
  it("waits with how far along, finishes, or gives up", () => {
    expect(processingStep({ status: "processing", done: 1, total: 3 })).toEqual({ next: "wait", done: 1, total: 3 })
    expect(processingStep({ status: "draft" })).toEqual({ next: "wait", done: 0, total: 1 })
    expect(processingStep({ status: "ready" })).toEqual({ next: "ready" })
    expect(processingStep({ status: "failed", error: "Bad cut." })).toEqual({ next: "failed", error: "Bad cut." })
    expect(processingStep({ status: "failed", error: "" })).toEqual({ next: "failed", error: PROCESSING_FAILED })
  })
})

describe("the routes about one dance", () => {
  it("keep the id for trim and processing, like the dance route", () => {
    expect(resolveRoute("#/trim/ab12", true)).toEqual({ route: "trim", hash: "#/trim/ab12", id: "ab12" })
    expect(resolveRoute("#/processing/ab12", true)).toEqual({ route: "processing", hash: "#/processing/ab12", id: "ab12" })
    expect(resolveRoute("#/dance/ab12", true).id).toBe("ab12")
  })
  it("need a token", () => {
    expect(resolveRoute("#/trim/ab12", false).route).toBe("pair")
  })
})

describe("trending and a dance's status on the server", () => {
  const work = mkdtempSync(join(tmpdir(), "add-"))
  const server = createIngestServer({ storageDir: work })
  let base = ""
  const ready = (id: string, o = {}) => {
    mkdirSync(join(work, id), { recursive: true })
    writeFileSync(join(work, id, "package.json"), JSON.stringify(makeDance({ id, video: `${id}.mp4`, ...o })))
  }
  beforeAll(async () => {
    ready("aaaaaaaaaaaa", { title: "First" })
    ready("bbbbbbbbbbbb", { title: "Second" })
    mkdirSync(join(work, "cccccccccccc"))
    writeFileSync(join(work, "cccccccccccc", "original.mp4"), "x")
    await new Promise<void>((ok) => server.listen(0, ok))
    base = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => {
    server.close()
    rmSync(work, { recursive: true, force: true })
  })
  const get = (path: string) => fetch(`${base}${path}`)

  it("lists no trending dances without a trending.json", async () => {
    expect(await (await get("/trending")).json()).toEqual([])
  })
  it("lists the ready dances in trending.json, in its order, and skips ids that are not ready", async () => {
    writeFileSync(join(work, "trending.json"), JSON.stringify(["bbbbbbbbbbbb", "cccccccccccc", "dddddddddddd", 7, "aaaaaaaaaaaa"]))
    const list = await (await get("/trending")).json()
    expect(list.map((d: { title: string }) => d.title)).toEqual(["Second", "First"])
    expect(list[0]).toMatchObject({ id: "bbbbbbbbbbbb", sections: expect.any(Number), lengthSec: expect.any(Number) })
  })
  it("ignores a broken trending.json", async () => {
    writeFileSync(join(work, "trending.json"), "{not json")
    expect(await (await get("/trending")).json()).toEqual([])
  })
  it("reports a ready dance, a draft and a missing one", async () => {
    expect(await (await get("/dances/aaaaaaaaaaaa")).json()).toEqual({ status: "ready" })
    expect(await (await get("/dances/cccccccccccc")).json()).toEqual({ status: "draft" })
    expect((await get("/dances/eeeeeeeeeeee")).status).toBe(404)
  })
  it("reports a save that failed, with the reason", async () => {
    const put = await fetch(`${base}/dances/cccccccccccc`, { method: "PUT", body: "{not json" })
    expect(put.status).toBe(422)
    expect(await (await get("/dances/cccccccccccc")).json()).toEqual({ status: "failed", error: "That dance package isn't valid JSON." })
  })
})
