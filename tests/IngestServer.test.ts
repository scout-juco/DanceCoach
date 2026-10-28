import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { createIngestServer } from "../server/ingestServer"

// Real ffmpeg, real server: a 10 s clip with a click on every beat of 120 bpm (first beat at 0.5 s).
const work = mkdtempSync(join(tmpdir(), "ingest-"))
const clicks = "sin(2*PI*1000*t)*lt(mod(t-0.5,0.5),0.04)*gte(t,0.5)"
const fixture = join(work, "clicks.mp4")
const silent = join(work, "silent.mp4")
const notVideo = join(work, "notes.txt")
const storage = join(work, "storage")
const server = createIngestServer({ storageDir: storage })
let base = ""

beforeAll(async () => {
  const video = ["-f", "lavfi", "-i", "testsrc=size=160x120:rate=15:duration=10"]
  execFileSync("ffmpeg", ["-v", "error", "-y", ...video, "-f", "lavfi", "-i", `aevalsrc='${clicks}':d=10:s=44100`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fixture])
  execFileSync("ffmpeg", ["-v", "error", "-y", ...video, "-c:v", "libx264", "-pix_fmt", "yuv420p", silent])
  writeFileSync(notVideo, "not a video, just words")
  await new Promise<void>((ok) => server.listen(0, ok))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
}, 60_000)

afterAll(() => {
  server.close()
  rmSync(work, { recursive: true, force: true })
})

const upload = (file: string, name: string) =>
  fetch(`${base}/dances?name=${encodeURIComponent(name)}`, { method: "POST", body: readFileSync(file) })

describe("POST /dances", () => {
  it("returns a draft package that passes package validation, with a confidence", async () => {
    const res = await upload(fixture, "My Dance.mp4")
    expect(res.status).toBe(201)
    const { package: pkg, confidence } = await res.json()
    expect(() => loadDancePackage(pkg)).not.toThrow()
    expect(pkg.title).toBe("My Dance")
    expect(pkg.trim.start).toBe(0)
    expect(pkg.trim.end).toBeCloseTo(10, 0)
    expect(Math.abs(pkg.bpm - 120)).toBeLessThanOrEqual(1)
    expect(pkg.firstBeatSec).toBeGreaterThanOrEqual(0)
    expect(confidence).toBeGreaterThanOrEqual(0)
    expect(confidence).toBeLessThanOrEqual(1)
  }, 60_000)

  it("stores the original under the dance's id, and names the video uniquely", async () => {
    const { package: pkg } = await (await upload(fixture, "a.mp4")).json()
    const { package: other } = await (await upload(fixture, "a.mp4")).json()
    expect(existsSync(join(storage, pkg.id, "original.mp4"))).toBe(true)
    expect(pkg.video).not.toBe(other.video)
    expect(pkg.id).not.toBe(other.id)
  }, 60_000)

  it("explains a file that isn't a video, and keeps nothing", async () => {
    const before = readdirSync(storage).length
    const res = await upload(notVideo, "notes.txt")
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/isn't a video/)
    expect(readdirSync(storage).length).toBe(before)
  })

  it("explains a video with no audio", async () => {
    const res = await upload(silent, "silent.mp4")
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/no sound/)
  })
})

describe("saving, listing and serving a dance", () => {
  const draft = async () => (await (await upload(fixture, "Save Me.mp4")).json()).package
  const save = (id: string, pkg: unknown) => fetch(`${base}/dances/${id}`, { method: "PUT", body: JSON.stringify(pkg) })
  const ids = async () => (await (await fetch(`${base}/dances`)).json()).map((d: { id: string }) => d.id)

  it("cuts the clips of a valid package, marks it ready, and serves the package and every clip", async () => {
    const pkg = await draft()
    expect(await ids()).not.toContain(pkg.id)

    const saved = await save(pkg.id, { ...pkg, title: "Adjusted", difficulty: "Intermediate", trim: { start: 0, end: 9 } })
    expect(saved.status).toBe(200)

    const list = await (await fetch(`${base}/dances`)).json()
    expect(list).toContainEqual({ id: pkg.id, title: "Adjusted", difficulty: "Intermediate" })

    const served = loadDancePackage(await (await fetch(`${base}/dances/${pkg.id}/package`)).json())
    expect(served.title).toBe("Adjusted")
    const plan = planClips(served)
    expect(plan.length).toBeGreaterThan(0)
    for (const clip of plan) {
      const name = `${clipAssetName(served.video, clip.id)}.mp4`
      const res = await fetch(`${base}/dances/${pkg.id}/clips/${name}`)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("video/mp4")
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
    }
    expect(new Set(plan.map((c) => clipAssetName(served.video, c.id))).size).toBe(plan.length)
    expect(served.video.startsWith(pkg.id)).toBe(true)
  }, 120_000)

  it("refuses an invalid package with the validation's error, and the dance stays out of the list", async () => {
    const pkg = await draft()
    const res = await save(pkg.id, { ...pkg, bpm: -5 })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/bpm must be a positive number/)
    expect(await ids()).not.toContain(pkg.id)
    expect((await fetch(`${base}/dances/${pkg.id}/package`)).status).toBe(404)
  }, 60_000)

  it("refuses a body that isn't JSON, and a dance that was never uploaded", async () => {
    const pkg = await draft()
    const res = await fetch(`${base}/dances/${pkg.id}`, { method: "PUT", body: "nope" })
    expect(res.status).toBe(422)
    expect((await save("000000000000", pkg)).status).toBe(404)
  }, 60_000)

  it("only serves clips in the dance's clip plan", async () => {
    const pkg = await draft()
    await save(pkg.id, pkg)
    expect((await fetch(`${base}/dances/${pkg.id}/clips/${pkg.id}_nope.mp4`)).status).toBe(404)
    expect((await fetch(`${base}/dances/${pkg.id}/clips/..%2Foriginal.mp4`)).status).toBe(404)
  }, 120_000)
})
