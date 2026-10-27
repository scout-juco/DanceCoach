import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CountClock } from "../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { createIngestServer } from "../server/ingestServer"
import { overlayLabel } from "../server/page/overlay"

const pkg = (over = {}) =>
  loadDancePackage({ id: "x", title: "t", difficulty: "Beginner", video: "x.mp4", trim: { start: 0, end: 20 }, bpm: 120, firstBeatSec: 2, source: "upload", ...over })

describe("overlayLabel", () => {
  // 120 bpm: a count is 0.5 s, a section 4 s. Sections start at 2, 6, 10, 14, 18 (the last is partial).
  const label = (t: number, over = {}) => overlayLabel(new CountClock(pkg(over)), t)

  it("says which section and count, as the lens's count logic does", () => {
    expect(label(2)).toBe("Section 1 · count 1")
    expect(label(10 + 4 * 0.5)).toBe("Section 3 · count 5")
    expect(label(5.99)).toBe("Section 1 · count 8")
  })

  it("is before section 1 in the lead-in, and when the clip has ended", () => {
    expect(label(1.5)).toBe("Before section 1")
    expect(label(20)).toBe("Clip ended")
  })

  it("follows a partial last section and a nudged section", () => {
    expect(label(19)).toBe("Section 5 · count 3")
    expect(label(10, { sections: [{ start: 2 }, { start: 6 }, { start: 11 }] })).toBe("Section 2 · count 8")
    expect(label(11, { sections: [{ start: 2 }, { start: 6 }, { start: 11 }] })).toBe("Section 3 · count 1")
  })

  it("changes straight away with the first beat, bpm and trim", () => {
    expect(label(2, { firstBeatSec: 2.5 })).toBe("Before section 1")
    expect(label(6, { bpm: 60 })).toBe("Section 1 · count 5")
    expect(label(15, { trim: { start: 0, end: 15 } })).toBe("Clip ended")
  })
})

describe("the adjust page", () => {
  const work = mkdtempSync(join(tmpdir(), "adjust-"))
  const fixture = join(work, "v.mp4")
  const server = createIngestServer({ storageDir: join(work, "storage") })
  let base = ""

  beforeAll(async () => {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=15:duration=3",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fixture])
    await new Promise<void>((ok) => server.listen(0, ok))
    base = `http://localhost:${(server.address() as AddressInfo).port}`
  }, 60_000)
  afterAll(() => {
    server.close()
    rmSync(work, { recursive: true, force: true })
  })

  it("serves the page and a script bundled with the lens's count logic", async () => {
    const page = await fetch(`${base}/`)
    expect(page.headers.get("content-type")).toMatch(/text\/html/)
    expect(await page.text()).toContain('src="/app.js"')
    const js = await fetch(`${base}/app.js`)
    expect(js.headers.get("content-type")).toMatch(/javascript/)
    expect(await js.text()).toContain("Section ")
  })

  it("serves the uploaded original, with ranges so the page can seek", async () => {
    const { package: draft } = await (await fetch(`${base}/dances?name=v.mp4`, { method: "POST", body: readFileSync(fixture) })).json()
    const whole = await fetch(`${base}/dances/${draft.id}/original`)
    expect(whole.status).toBe(200)
    expect(whole.headers.get("content-type")).toBe("video/mp4")
    const bytes = (await whole.arrayBuffer()).byteLength
    const part = await fetch(`${base}/dances/${draft.id}/original`, { headers: { Range: "bytes=10-19" } })
    expect(part.status).toBe(206)
    expect(part.headers.get("content-range")).toBe(`bytes 10-19/${bytes}`)
    expect((await part.arrayBuffer()).byteLength).toBe(10)
    expect((await fetch(`${base}/dances/000000000000/original`)).status).toBe(404)
  }, 60_000)
})
