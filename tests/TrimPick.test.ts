import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { clipJobs, cropFilter } from "../scripts/cutClips"
import { createIngestServer } from "../server/ingestServer"
import { NETWORK_ERROR } from "../server/page/phone/pairing"
import { clockText, contentBox, endLabel, fetchDraft, focusFromDrag, frameTimes, moveEnd, moveStart, splitPackage, startLabel, startSplit, takeSplitFailure, timeAtPointer, trackPosition } from "../server/page/phone/trim"
import { makeDance } from "./fixtures"

const reply = (status: number, body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch
const down = (() => Promise.reject(new Error("down"))) as unknown as typeof fetch

describe("the trim labels", () => {
  it("read m:ss START and m:ss END", () => {
    expect(startLabel(3.4)).toBe("0:03 START")
    expect(endLabel(34)).toBe("0:34 END")
    expect(clockText(125)).toBe("2:05")
    expect(clockText(NaN)).toBe("–:––")
  })
})

describe("moving the trim", () => {
  const d = { trim: { start: 0, end: 30 }, bpm: 120, firstBeatSec: 1 }
  it("keeps count 1 on the beat grid, after the start", () => {
    const r = moveStart(d, 3.2)
    expect(r.trim).toEqual({ start: 3.2, end: 30 })
    expect(r.firstBeatSec).toBeCloseTo(3.5)
  })
  it("leaves count 1 alone while it is still inside the trim", () => {
    expect(moveStart(d, 0.5).firstBeatSec).toBe(1)
  })
  it("stops the start on the last beat before the end, so the package stays valid", () => {
    const r = moveStart({ trim: { start: 0, end: 5 }, bpm: 60, firstBeatSec: 1 }, 4.9)
    expect(r.firstBeatSec).toBeLessThan(5)
    expect(r.trim.start).toBeLessThanOrEqual(r.firstBeatSec)
  })
  it("never lets the end pass the video, the start, or count 1", () => {
    expect(moveEnd(d, 99, 40).trim.end).toBe(40)
    expect(moveEnd({ ...d, trim: { start: 10, end: 30 } }, 2, 40).trim.end).toBeCloseTo(10.1)
    expect(moveEnd(d, 0, 40).trim.end).toBeCloseTo(1.1)
  })
  it("always gives a package the Lens accepts", () => {
    for (const t of [0, 2.2, 7, 29.9, 100]) {
      const s = moveStart(d, t)
      const e = moveEnd({ ...d, ...s }, t / 2, 30)
      expect(() => loadDancePackage(makeDance({ ...e, bpm: 120 }))).not.toThrow()
    }
  })
})

describe("the track", () => {
  it("keeps the handles inside it", () => {
    expect(trackPosition(0, 30)).toBe("calc(0 * (100% - 16px) + 8px)")
    expect(trackPosition(60, 30)).toBe("calc(1 * (100% - 16px) + 8px)")
  })
  it("reads the time under a finger", () => {
    expect(timeAtPointer(8, 0, 342, 30)).toBe(0)
    expect(timeAtPointer(334, 0, 342, 30)).toBe(30)
    expect(timeAtPointer(171, 0, 342, 30)).toBeCloseTo(15)
    expect(timeAtPointer(-50, 0, 342, 30)).toBe(0)
  })
  it("takes 8 frames from the middle of equal slices", () => {
    const t = frameTimes(16)
    expect(t).toHaveLength(8)
    expect(t[0]).toBe(1)
    expect(t[7]).toBe(15)
  })
})

describe("picking a dancer by dragging a box", () => {
  const c = { x: 0, y: 0, w: 240, h: 428 }
  it("fits a wide video inside the 240×428 picture, centred", () => {
    const wide = contentBox(240, 428, 1920, 1080)
    expect(wide.w).toBe(240)
    expect(wide.h).toBeCloseTo(135)
    expect(wide.y).toBeCloseTo((428 - 135) / 2)
    expect(contentBox(240, 428, 1080, 1920).w).toBeCloseTo(240, 0)
  })
  it("gives fractions of the frame, whichever way it is dragged", () => {
    expect(focusFromDrag({ x: 60, y: 107 }, { x: 180, y: 321 }, c)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
    expect(focusFromDrag({ x: 180, y: 321 }, { x: 60, y: 107 }, c)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
  })
  it("holds the box to the part of the picture the video fills", () => {
    const letterbox = contentBox(240, 428, 1920, 1080)
    expect(focusFromDrag({ x: -20, y: 0 }, { x: 500, y: 428 }, letterbox)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
  it("treats a tap or a sliver as no box", () => {
    expect(focusFromDrag({ x: 100, y: 100 }, { x: 101, y: 102 }, c)).toBeNull()
    expect(focusFromDrag({ x: 0, y: 100 }, { x: 240, y: 102 }, c)).toBeNull()
  })
  it("makes a focus the package accepts", () => {
    const f = focusFromDrag({ x: 10, y: 10 }, { x: 200, y: 400 }, c)!
    expect(() => loadDancePackage(makeDance({ focus: f }))).not.toThrow()
  })
})

describe("the package validation of focus", () => {
  it("refuses a box outside the frame or with no size", () => {
    for (const focus of [{ x: 0.8, y: 0, w: 0.5, h: 1 }, { x: -0.1, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0, w: 0, h: 0.5 }]) {
      expect(() => loadDancePackage(makeDance({ focus }))).toThrow(/focus/)
    }
  })
})

describe("what is sent to be split", () => {
  const draft = makeDance({ trim: { start: 0, end: 40 }, firstBeatSec: 1, focus: undefined })
  it("carries the trim, count 1 and the dancer", () => {
    const pkg = splitPackage(draft, { trim: { start: 3, end: 34 }, firstBeatSec: 3.5 }, { x: 0.2, y: 0.1, w: 0.3, h: 0.8 })
    expect(pkg).toMatchObject({ trim: { start: 3, end: 34 }, firstBeatSec: 3.5, focus: { x: 0.2, y: 0.1, w: 0.3, h: 0.8 } })
  })
  it("leaves focus out when no dancer was picked, even if the draft had one", () => {
    const pkg = splitPackage({ ...draft, focus: { x: 0, y: 0, w: 1, h: 1 } }, { trim: draft.trim, firstBeatSec: 1 }, null)
    expect("focus" in pkg).toBe(false)
  })
})

describe("the Lens gets the dancer", () => {
  it("crops every clip to the focus, on even sizes, before the shrink", () => {
    const pkg = makeDance({ focus: { x: 0.25, y: 0.1, w: 0.5, h: 0.8 } })
    const [job] = clipJobs(pkg, "in.mp4", "out")
    const vf = job.args[job.args.indexOf("-vf") + 1]
    expect(vf.startsWith("crop='trunc(iw*0.50000/2)*2':'trunc(ih*0.80000/2)*2':'trunc(iw*0.25000/2)*2':'trunc(ih*0.10000/2)*2',scale=")).toBe(true)
  })
  it("leaves the frame whole with no focus", () => {
    expect(cropFilter(undefined)).toBe("")
    const [job] = clipJobs(makeDance({ focus: undefined }), "in.mp4", "out")
    expect(job.args[job.args.indexOf("-vf") + 1].startsWith("scale=")).toBe(true)
  })
})

describe("loading the draft and splitting", () => {
  it("gives the draft package, or a readable error", async () => {
    expect(await fetchDraft("ab", reply(200, { package: { id: "ab" }, confidence: 0.9 }))).toEqual({ ok: true, package: { id: "ab" } })
    expect(await fetchDraft("ab", reply(404, { error: "There is no such draft." }))).toEqual({ ok: false, error: "There is no such draft." })
    expect(await fetchDraft("ab", down)).toEqual({ ok: false, error: NETWORK_ERROR })
  })
  it("sends the package with the phone's token, and keeps nothing when it is accepted", async () => {
    const seen: [string, RequestInit | undefined][] = []
    const spy = ((u: string, i?: RequestInit) => (seen.push([u, i]), Promise.resolve(new Response("{}", { status: 200 })))) as unknown as typeof fetch
    await startSplit(makeDance({ id: "aaaaaaaaaaaa" }), "tok", spy)
    expect(seen[0][0]).toBe("/dances/aaaaaaaaaaaa")
    expect(seen[0][1]).toMatchObject({ method: "PUT", headers: { Authorization: "Bearer tok" } })
    expect(JSON.parse(String(seen[0][1]?.body)).id).toBe("aaaaaaaaaaaa")
    expect(takeSplitFailure("aaaaaaaaaaaa")).toBeUndefined()
  })
  it("keeps a refusal once, for the processing screen", async () => {
    const pkg = makeDance({ id: "bbbbbbbbbbbb" })
    await startSplit(pkg, "tok", reply(401, { error: "Pair your phone with your Specs first." }))
    expect(takeSplitFailure("bbbbbbbbbbbb")).toBe("Pair your phone with your Specs first.")
    expect(takeSplitFailure("bbbbbbbbbbbb")).toBeUndefined()
    await startSplit(pkg, "tok", down)
    expect(takeSplitFailure("bbbbbbbbbbbb")).toBe(NETWORK_ERROR)
  })
})

describe("the draft on the server", () => {
  const work = mkdtempSync(join(tmpdir(), "trim-"))
  const server = createIngestServer({ storageDir: work })
  let base = ""
  beforeAll(async () => {
    mkdirSync(join(work, "aaaaaaaaaaaa"))
    writeFileSync(join(work, "aaaaaaaaaaaa", "draft.json"), JSON.stringify({ package: makeDance({ id: "aaaaaaaaaaaa" }), confidence: 0.8 }))
    await new Promise<void>((ok) => server.listen(0, ok))
    base = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => {
    server.close()
    rmSync(work, { recursive: true, force: true })
  })
  it("serves a draft by its id", async () => {
    const body = await (await fetch(`${base}/dances/aaaaaaaaaaaa/draft`)).json()
    expect(body.package.id).toBe("aaaaaaaaaaaa")
    expect(body.confidence).toBe(0.8)
  })
  it("says there is no draft for an unknown id", async () => {
    expect((await fetch(`${base}/dances/bbbbbbbbbbbb/draft`)).status).toBe(404)
  })
})
