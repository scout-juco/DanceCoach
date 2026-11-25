import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { planStills } from "../DanceCoachLens/Assets/Scripts/Core/StillPlan"
import { createIngestServer } from "../server/ingestServer"

// Real ffmpeg, real server: a 10 s clip with a click on every beat of 120 bpm (first beat at 0.5 s).
const work = mkdtempSync(join(tmpdir(), "ingest-"))
const clicks = "sin(2*PI*1000*t)*lt(mod(t-0.5,0.5),0.04)*gte(t,0.5)"
const fixture = join(work, "clicks.mp4")
const ramp = join(work, "ramp.mp4")
const silent = join(work, "silent.mp4")
const notVideo = join(work, "notes.txt")
const storage = join(work, "storage")
// The link path with yt-dlp faked: links containing "private" fail, everything else yields the fixture.
const server = createIngestServer({
  storageDir: storage,
  fetchVideo: async (url, dir) => {
    if (url.includes("private")) throw new Error("yt-dlp: video unavailable")
    copyFileSync(fixture, join(dir, "original.mp4"))
    return { original: join(dir, "original.mp4"), title: "Linked Dance" }
  },
})
let base = ""

beforeAll(async () => {
  const video = ["-f", "lavfi", "-i", "testsrc=size=160x120:rate=15:duration=10"]
  execFileSync("ffmpeg", ["-v", "error", "-y", ...video, "-f", "lavfi", "-i", `aevalsrc='${clicks}':d=10:s=44100`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fixture])
  // A frame counter you can read back from a pixel: the picture's brightness is 25.5 per second of video (in the 16–235 range video uses, so it reads back as 0–255).
  const rampVideo = ["-f", "lavfi", "-i", "color=c=black:size=64x64:rate=25:duration=10,geq=lum='16+219*T/10':cb=128:cr=128"]
  execFileSync("ffmpeg", ["-v", "error", "-y", ...rampVideo, "-f", "lavfi", "-i", `aevalsrc='${clicks}':d=10:s=44100`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", ramp])
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

describe("POST /dances/link", () => {
  const link = (url: unknown) => fetch(`${base}/dances/link`, { method: "POST", body: JSON.stringify({ url }) })

  it("returns the same kind of draft as an upload, with the link as its source", async () => {
    const res = await link("https://www.tiktok.com/@dancer/video/123")
    expect(res.status).toBe(201)
    const { package: pkg } = await res.json()
    expect(() => loadDancePackage(pkg)).not.toThrow()
    expect(pkg.source).toBe("https://www.tiktok.com/@dancer/video/123")
    expect(pkg.title).toBe("Linked Dance")
    expect(Math.abs(pkg.bpm - 120)).toBeLessThanOrEqual(1)
    // The adjust page can preview it, and Ready works as for an upload.
    expect((await fetch(`${base}/dances/${pkg.id}/original`)).status).toBe(200)
    expect((await fetch(`${base}/dances/${pkg.id}`, { method: "PUT", body: JSON.stringify(pkg) })).status).toBe(200)
  }, 120_000)

  it("suggests an upload when the link can't be fetched, and keeps nothing", async () => {
    const before = readdirSync(storage).length
    const res = await link("https://www.instagram.com/private/reel/1")
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/uploading the file/)
    expect(readdirSync(storage).length).toBe(before)
  })

  it("refuses something that isn't a link", async () => {
    for (const bad of ["not a link", "file:///etc/passwd", 42]) {
      const res = await link(bad)
      expect(res.status).toBe(422)
      expect((await res.json()).error).toMatch(/link/)
    }
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
    expect(list).toContainEqual(expect.objectContaining({ id: pkg.id, title: "Adjusted", difficulty: "Intermediate", sections: expect.any(Number), lengthSec: 9 }))

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

  it("cuts the clips and stills again for a dance cut with older settings", async () => {
    const pkg = await draft()
    await save(pkg.id, pkg)
    const clips = join(storage, pkg.id, "clips")
    const old = join(clips, "old.txt")
    writeFileSync(old, "from the old cut")
    rmSync(join(clips, ".cut-version"))
    const again = await save(pkg.id, pkg)
    expect(again.status).toBe(200)
    expect(existsSync(old)).toBe(false) // re-cut
    expect(existsSync(join(clips, ".cut-version"))).toBe(true)
  }, 120_000)

  it("re-saves a ready dance with a new name without cutting its clips again", async () => {
    const pkg = await draft()
    await save(pkg.id, pkg)
    const clips = join(storage, pkg.id, "clips")
    const marker = join(clips, "marker.txt")
    writeFileSync(marker, "still here")
    const renamed = await save(pkg.id, { ...pkg, title: "Renamed", difficulty: "Advanced" })
    expect(renamed.status).toBe(200)
    expect(existsSync(marker)).toBe(true) // clips untouched
    expect(await (await fetch(`${base}/dances`)).json()).toContainEqual(expect.objectContaining({ id: pkg.id, title: "Renamed", difficulty: "Advanced" }))
    // Changing the timing does cut again.
    await save(pkg.id, { ...pkg, trim: { start: 0, end: 8 } })
    expect(existsSync(marker)).toBe(false)
  }, 120_000)

  it("re-saves with a different BPM and serves the new clip set, dropping clips no longer planned", async () => {
    const pkg = await draft()
    await save(pkg.id, pkg)
    const clipNames = async (p: any) => planClips(p).map((c) => `${clipAssetName(p.video, c.id)}.mp4`)
    const before = await clipNames(pkg)
    const slower = { ...pkg, bpm: pkg.bpm / 2 }
    expect((await save(pkg.id, slower)).status).toBe(200)
    const served = await (await fetch(`${base}/dances/${pkg.id}/package`)).json()
    expect(served.bpm).toBe(slower.bpm)
    const after = await clipNames(served)
    expect(after).not.toEqual(before)
    expect(readdirSync(join(storage, pkg.id, "clips")).filter((f) => !f.startsWith(".")).sort()).toEqual([...after].sort())
    for (const name of after) expect((await fetch(`${base}/dances/${pkg.id}/clips/${name}`)).status).toBe(200)
    for (const name of before.filter((n) => !after.includes(n))) {
      expect((await fetch(`${base}/dances/${pkg.id}/clips/${name}`)).status).toBe(404)
    }
  }, 180_000)

  it("deletes a dance and its files, and says so when there is nothing to delete", async () => {
    const pkg = await draft()
    await save(pkg.id, pkg)
    expect(await ids()).toContain(pkg.id)
    expect((await fetch(`${base}/dances/${pkg.id}`, { method: "DELETE" })).status).toBe(200)
    expect(await ids()).not.toContain(pkg.id)
    expect(existsSync(join(storage, pkg.id))).toBe(false)
    expect((await fetch(`${base}/dances/${pkg.id}`, { method: "DELETE" })).status).toBe(404)
    expect((await fetch(`${base}/dances/..%2F`, { method: "DELETE" })).status).toBe(404)
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

describe("stills", () => {
  const save = (id: string, pkg: unknown) => fetch(`${base}/dances/${id}`, { method: "PUT", body: JSON.stringify(pkg) })
  // 120 bpm, first beat at 0.5 s, 10 s of footage: sections start at 0.5, 4.5 and 8.5; the last has 6 counts of footage.
  const timing = { bpm: 120, firstBeatSec: 0.5, trim: { start: 0, end: 10 } }
  const ready = async (extra: object = {}) => {
    const { package: draft } = await (await upload(ramp, "Ramp.mp4")).json()
    const pkg = { ...draft, ...timing, ...extra }
    expect((await save(draft.id, pkg)).status).toBe(200)
    return loadDancePackage(await (await fetch(`${base}/dances/${draft.id}/package`)).json())
  }
  const stillFile = (pkg: { id: string }, name: string) => join(storage, pkg.id, "stills", name)
  /** The frame's brightness (0–255) at one pixel of a JPEG or a frame of the original at `at` s. */
  const luma = (file: string, at?: number) =>
    execFileSync("ffmpeg", ["-v", "error", ...(at === undefined ? [] : ["-ss", String(at)]), "-i", file, "-frames:v", "1",
      "-vf", "scale=1:1", "-pix_fmt", "gray", "-f", "rawvideo", "-"])[0]

  it("writes 16 stills per section when a dance is made ready, and lists them in the package", async () => {
    const pkg = await ready()
    expect(pkg.stills?.map((s) => s.length)).toEqual([16, 16, 16])
    expect(readdirSync(join(storage, pkg.id, "stills")).filter((f) => !f.startsWith(".")).sort()).toEqual(pkg.stills!.flat().sort())
    for (const name of pkg.stills!.flat()) expect(existsSync(stillFile(pkg, name))).toBe(true)
  }, 180_000)

  it("takes each still at its count's time", async () => {
    const pkg = await ready()
    for (const { section, index, time } of planStills(pkg)) {
      if (time > 9.9) continue // held on the last frame; see the next test
      const got = luma(stillFile(pkg, pkg.stills![section - 1][index]))
      expect(Math.abs(got - (255 * time) / 10), `section ${section} step ${index} at ${time}s`).toBeLessThanOrEqual(8)
      // And it is the frame ffmpeg finds in the original at that time.
      expect(Math.abs(got - luma(join(storage, pkg.id, `original.mp4`), time))).toBeLessThanOrEqual(3)
    }
  }, 180_000)

  it("uses the last frame for counts past the end of a short last section", async () => {
    const pkg = await ready()
    const last = pkg.stills![2]
    const lastBrightness = luma(stillFile(pkg, last[15]))
    expect(lastBrightness).toBeGreaterThan(240) // the last frame, not a missing one
    for (const index of [6, 7, 10, 15]) expect(luma(stillFile(pkg, last[index]))).toBe(lastBrightness)
    expect(luma(stillFile(pkg, last[3]))).toBeLessThan(lastBrightness - 5) // 10 s of footage still has real frames before
  }, 180_000)

  it("serves each still as a JPEG, and 404s an unknown one, one from another dance, or a path out", async () => {
    const pkg = await ready()
    const name = pkg.stills![0][3]
    const res = await fetch(`${base}/dances/${pkg.id}/stills/${name}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/jpeg")
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8])
    for (const bad of ["nope.jpg", `${pkg.id}_pose9_1.jpg`, "..%2Foriginal.mp4", "..%2Fpackage.json"]) {
      expect((await fetch(`${base}/dances/${pkg.id}/stills/${bad}`)).status).toBe(404)
    }
    expect((await fetch(`${base}/dances/000000000000/stills/${name}`)).status).toBe(404)
  }, 180_000)

  it("keeps the stills on a re-save without timing changes, and cuts them again when timing changes", async () => {
    const pkg = await ready()
    const marker = join(storage, pkg.id, "stills", "marker.txt")
    writeFileSync(marker, "still here")
    expect((await save(pkg.id, { ...pkg, title: "Renamed" })).status).toBe(200)
    expect(existsSync(marker)).toBe(true)
    const after = loadDancePackage(await (await fetch(`${base}/dances/${pkg.id}/package`)).json())
    expect(after.title).toBe("Renamed")
    expect(after.stills).toEqual(pkg.stills)

    expect((await save(pkg.id, { ...pkg, firstBeatSec: 1 })).status).toBe(200)
    expect(existsSync(marker)).toBe(false)
    const moved = loadDancePackage(await (await fetch(`${base}/dances/${pkg.id}/package`)).json())
    expect(Math.abs(luma(stillFile(pkg, moved.stills![0][0])) - 25.5)).toBeLessThanOrEqual(8) // count 1 is now at 1 s
  }, 240_000)

  it("adds stills when a dance made ready without them is saved again", async () => {
    const pkg = await ready()
    // Make it look like a dance from before Pose: no stills folder, no stills in the package.
    rmSync(join(storage, pkg.id, "stills"), { recursive: true })
    const { stills, ...old } = pkg
    writeFileSync(join(storage, pkg.id, "package.json"), JSON.stringify(old))
    expect((await fetch(`${base}/dances/${pkg.id}/package`)).status).toBe(200)
    expect((await (await fetch(`${base}/dances/${pkg.id}/package`)).json()).stills).toBeUndefined()
    expect((await fetch(`${base}/dances/${pkg.id}/stills/${stills![0][0]}`)).status).toBe(404)

    expect((await save(pkg.id, old)).status).toBe(200)
    expect(existsSync(stillFile(pkg, stills![0][0]))).toBe(true)
    expect((await fetch(`${base}/dances/${pkg.id}/stills/${stills![0][0]}`)).status).toBe(200)
  }, 240_000)

  it("keeps serving the old stills when a new cut fails", async () => {
    const pkg = await ready()
    const name = pkg.stills![0][0]
    const before = Buffer.from(await (await fetch(`${base}/dances/${pkg.id}/stills/${name}`)).arrayBuffer())
    // Corrupt the original so ffmpeg can't cut, then change the timing so a cut is needed.
    const original = join(storage, pkg.id, "original.mp4")
    writeFileSync(original, "broken")
    const res = await save(pkg.id, { ...pkg, bpm: 100 })
    expect(res.status).toBe(500)
    const after = Buffer.from(await (await fetch(`${base}/dances/${pkg.id}/stills/${name}`)).arrayBuffer())
    expect(after.equals(before)).toBe(true)
    expect((await (await fetch(`${base}/dances/${pkg.id}/package`)).json()).bpm).toBe(120)
    expect(readdirSync(join(storage, pkg.id)).filter((f) => f.endsWith(".tmp"))).toEqual([])
  }, 180_000)
})

describe("takes", { timeout: 120_000 }, () => {
  // The same server code on a clock the tests move, over the same storage.
  let now = 1_000_000
  const clocked = createIngestServer({ storageDir: storage, now: () => now, uploadTimeoutMs: 5000 })
  let url = ""
  beforeAll(async () => {
    await new Promise<void>((ok) => clocked.listen(0, ok))
    url = `http://localhost:${(clocked.address() as AddressInfo).port}`
  })
  afterAll(() => void clocked.close())

  // 120 bpm, first beat at 0.5 s, 10 s of footage: section 2 runs 4.5–8.5 s and leads in from 2.5 s.
  const readyDance = async () => {
    const { package: draft } = await (await upload(ramp, "Ramp.mp4")).json()
    const pkg = { ...draft, bpm: 120, firstBeatSec: 0.5, trim: { start: 0, end: 10 } }
    expect((await fetch(`${base}/dances/${draft.id}`, { method: "PUT", body: JSON.stringify(pkg) })).status).toBe(200)
    return draft.id as string
  }
  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${url}${path}`, { method, body: body === undefined ? undefined : typeof body === "string" || body instanceof Buffer ? body : JSON.stringify(body) })
  const arm = async (id: string, extra: object = {}) => {
    const res = await call("POST", `/dances/${id}/takes/session`, { section: 2, speed: 1, mirror: false, ...extra })
    return { res, session: await res.json() }
  }
  const status = async () => (await call("GET", "/recorder/status")).json()
  const clips: Record<string, string> = {}
  /** What a phone films: a brightness ramp over `seconds` (255 * t / seconds), with a tone from `musicAt` (none if null). */
  const filmed = (seconds: number, musicAt: number | null) => {
    const key = `${seconds}-${musicAt}`
    if (!clips[key]) {
      const file = (clips[key] = join(work, `film-${key}.mp4`))
      const video = ["-f", "lavfi", "-i", `color=c=black:size=64x64:rate=25:duration=${seconds},geq=lum='16+219*T/${seconds}':cb=128:cr=128`]
      const audio = musicAt === null ? [] : ["-f", "lavfi", "-i", `aevalsrc='0.5*sin(2*PI*440*t)*gte(t,${musicAt})':d=${seconds}:s=44100`, "-c:a", "aac"]
      execFileSync("ffmpeg", ["-v", "error", "-y", ...video, ...audio, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", file])
    }
    return readFileSync(clips[key])
  }
  const luma = (file: string) =>
    execFileSync("ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "gray", "-f", "rawvideo", "-"])[0]
  const probe = (file: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString())
  const record = async (id: string, film: Buffer, extra: object = {}) => {
    const { session } = await arm(id, extra)
    await call("GET", "/recorder/state")
    await call("POST", `/takes/session/${session.id}/start`)
    await call("POST", `/takes/session/${session.id}/stop`)
    return { session, res: await call("POST", `/takes/session/${session.id}/upload`, film) }
  }

  it("arm, start, stop, upload ends with a ready take, listed for its section with its speed, mirror and number", async () => {
    const id = await readyDance()
    const { session, res } = await record(id, filmed(10, 1), { speed: 0.75, mirror: true })
    expect(res.status).toBe(200)
    const done = await res.json()
    expect(done.state).toBe("ready")
    expect(done.take).toMatchObject({ name: "s2-t1", section: 2, speed: 0.75, mirror: true, number: 1 })
    expect((await status()).session).toMatchObject({ id: session.id, state: "ready", take: { name: "s2-t1" } })
    const listed = await (await call("GET", `/dances/${id}/takes?section=2`)).json()
    expect(listed).toEqual([done.take])
    expect(await (await call("GET", `/dances/${id}/takes?section=1`)).json()).toEqual([])
    // The next take of the section is number 2.
    const second = await (await record(id, filmed(10, 1))).res.json()
    expect(second.take.number).toBe(2)
  }, 120_000)

  it("takes the whole routine as section 0: named full-t<n>, listed under section 0, as long as every section together", async () => {
    const id = await readyDance()
    const { res } = await record(id, filmed(12, 1), { section: 0 })
    const done = await res.json()
    expect(done.state).toBe("ready")
    expect(done.take).toMatchObject({ name: "full-t1", section: 0, number: 1 })
    expect(await (await call("GET", `/dances/${id}/takes?section=0`)).json()).toEqual([done.take])
    expect(await (await call("GET", `/dances/${id}/takes?section=2`)).json()).toEqual([])
    // Section 1 starts at 0.5 s and the last section ends by the 10 s trim: far more than one 4 s section.
    expect(Number(probe(join(storage, id, "takes", "full-t1.mp4")).format.duration)).toBeGreaterThan(8)
    expect((await (await record(id, filmed(12, 1), { section: 0 })).res.json()).take.name).toBe("full-t2")
    expect((await arm(id, { section: 9 })).res.status).toBe(422)
  }, 120_000)

  it("starts the take on the section's count 1, within one frame of a known offset", async () => {
    const id = await readyDance()
    // Music starts at 1.0 s; section 2's count 1 is 2 s (4 counts) later at 1×.
    const { res } = await record(id, filmed(8, 1))
    const { take } = await res.json()
    expect(Math.abs(take.offset - 3)).toBeLessThanOrEqual(1 / 30)
    const file = join(storage, id, "takes", "s2-t1.mp4")
    // The first frame is the raw take's frame at 3 s: brightness 255 * 3 / 8.
    expect(Math.abs(luma(file) - (255 * 3) / 8)).toBeLessThanOrEqual(2)
    const info = probe(file)
    expect(Number(info.format.duration)).toBeCloseTo(4, 0)
    expect(info.streams.map((s: { codec_type: string }) => s.codec_type)).toEqual(["video"])
    expect(info.streams[0].codec_name).toBe("h264")
    // Served as an mp4; the raw upload is gone.
    const served = await call("GET", `/dances/${id}/takes/s2-t1.mp4`)
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toBe("video/mp4")
    expect(readdirSync(join(storage, id, "takes")).filter((f) => f.startsWith("raw-"))).toEqual([])
  }, 120_000)

  it("lines the take up by the clock when the phone says when its recorder began, whatever the sound", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    await call("GET", "/recorder/state")
    await call("POST", `/takes/session/${session.id}/start`)
    await call("POST", `/takes/session/${session.id}/stop`)
    // The recorder began 3 s before the glasses said start; the music in the recording starts at 1 s, which must be ignored.
    const res = await fetch(`${url}/takes/session/${session.id}/upload`, { method: "POST", headers: { "X-Recording-Started": String(now - 3000) }, body: filmed(10, 1) })
    // Count 1 of the clip is at 3 s, and section 2's count 1 is 2 s (4 counts) later at 1×.
    expect((await res.json()).take.offset).toBeCloseTo(5, 2)
  }, 120_000)

  it("counts count 1 from where the glasses say the clip was when it started", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    await call("GET", "/recorder/state")
    // Section 2 leads in from 2.5 s and starts at 4.5 s; the player was paused 0.2 s past its lead-in's start, and the recorder began 3 s earlier.
    await call("POST", `/takes/session/${session.id}/start`, { videoTimeSec: 2.7 })
    await call("POST", `/takes/session/${session.id}/stop`)
    const res = await fetch(`${url}/takes/session/${session.id}/upload`, { method: "POST", headers: { "X-Recording-Started": String(now - 3000) }, body: filmed(10, null) })
    // Count 1 is 4.5 - 2.7 = 1.8 s into the clip, which is 3 s into the recording.
    expect((await res.json()).take.offset).toBeCloseTo(4.8, 2)
  }, 120_000)

  it("takes the start the glasses worked out for themselves, since their \"start\" took a while to arrive", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    await call("GET", "/recorder/state")
    const started = await (await call("POST", `/takes/session/${session.id}/start`, { videoTimeSec: 2.5 })).json()
    expect(started.serverTime).toBe(now)
    // They worked out the clip really started 0.4 s before the server heard "start".
    await call("POST", `/takes/session/${session.id}/stop`, { startedAtServer: now - 400 })
    const res = await fetch(`${url}/takes/session/${session.id}/upload`, { method: "POST", headers: { "X-Recording-Started": String(now - 3000) }, body: filmed(10, null) })
    // The clip began 2.6 s into the recording, and count 1 is 2 s (4 counts) after that at 1×.
    expect((await res.json()).take.offset).toBeCloseTo(4.6, 2)
  }, 120_000)

  it("falls back to the server's clock when the recording has no sound", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    await call("POST", `/takes/session/${session.id}/start`)
    now += 6000 // the clip: 2 s of lead-in and the 4 s section
    await call("GET", "/recorder/state") // the phone is still polling
    await call("POST", `/takes/session/${session.id}/stop`)
    const res = await call("POST", `/takes/session/${session.id}/upload`, filmed(9, null))
    // The phone films a 1 s tail after stop, so the clip began 6 s before the 8 s mark of a 9 s recording: count 1 is at 2 + 2 = 4 s.
    expect((await res.json()).take.offset).toBeCloseTo(4, 2)
  }, 120_000)

  it("says phone connected only with a heartbeat in the last 3 s", async () => {
    now += 10_000
    expect((await status()).phoneConnected).toBe(false)
    await call("GET", "/recorder/state")
    expect((await status()).phoneConnected).toBe(true)
    now += 2900
    expect((await status()).phoneConnected).toBe(true)
    now += 200
    expect((await status()).phoneConnected).toBe(false)
  })

  it("gives the phone the armed session until the glasses stop it", async () => {
    const id = await readyDance()
    await arm(id, { section: 1 })
    expect((await (await call("GET", "/recorder/state")).json()).session).toMatchObject({ state: "armed", section: 1 })
    const { session } = await arm(id)
    expect((await (await call("GET", "/recorder/state")).json()).session).toMatchObject({ id: session.id, state: "armed", section: 2 })
    await call("POST", `/takes/session/${session.id}/start`)
    expect((await (await call("GET", "/recorder/state")).json()).session.state).toBe("recording")
    await call("POST", `/takes/session/${session.id}/stop`)
    expect((await (await call("GET", "/recorder/state")).json()).session).toBeNull()
  })

  it("replaces an old session when a new one is armed", async () => {
    const id = await readyDance()
    const first = (await arm(id)).session
    const second = (await arm(id, { section: 1 })).session
    expect(second.id).not.toBe(first.id)
    expect((await call("POST", `/takes/session/${first.id}/start`)).status).toBe(404)
    expect((await status()).session).toMatchObject({ id: second.id, section: 1, state: "armed" })
  })

  it("refuses to arm a take that makes no sense", async () => {
    const id = await readyDance()
    for (const bad of [{ section: -1 }, { section: 9 }, { section: 1.5 }, { speed: 0 }, { speed: "fast" }, { mirror: "no" }]) {
      expect((await arm(id, bad)).res.status).toBe(422)
    }
    expect((await call("POST", `/dances/000000000000/takes/session`, { section: 1, speed: 1, mirror: false })).status).toBe(404)
  })

  it("fails the session when a stop is not followed by an upload", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    await call("POST", `/takes/session/${session.id}/start`)
    await call("POST", `/takes/session/${session.id}/stop`)
    expect((await status()).session.state).toBe("uploading")
    now += 5100
    await call("GET", "/recorder/state") // the phone is still there, just not sending
    expect((await status()).session).toMatchObject({ state: "failed", reason: expect.stringMatching(/never sent/) })
  })

  it("fails the take at once when the phone goes quiet before sending its recording", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    await call("GET", "/recorder/state")
    await call("POST", `/takes/session/${session.id}/start`)
    now += 3100 // no heartbeat for the rest of the take
    await call("POST", `/takes/session/${session.id}/stop`)
    expect((await status()).session).toMatchObject({ state: "failed", reason: "The phone stopped filming. Record again?" })
  })

  it("keeps waiting for a phone that is still polling, and takes its late recording", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    await call("GET", "/recorder/state")
    await call("POST", `/takes/session/${session.id}/start`)
    await call("POST", `/takes/session/${session.id}/stop`)
    now += 2000
    await call("GET", "/recorder/state")
    expect((await status()).session.state).toBe("uploading")
    expect((await call("POST", `/takes/session/${session.id}/upload`, filmed(8, 1))).status).toBe(200)
  }, 120_000)

  it("cuts a short last section's take to the section's counts", async () => {
    const id = await readyDance() // section 3 runs 8.5–10 s: 3 counts
    const { res } = await record(id, filmed(8, 1), { section: 3 })
    const { take } = await res.json()
    expect(take).toMatchObject({ name: "s3-t1", section: 3 })
    const info = probe(join(storage, id, "takes", "s3-t1.mp4"))
    expect(Number(info.format.duration)).toBeCloseTo(1.5, 0)
    expect(Math.abs(Number(info.format.duration) - 1.5)).toBeLessThanOrEqual(0.15)
  }, 120_000)

  it("records a one-section dance's only section, and refuses a second", async () => {
    const { package: draft } = await (await upload(ramp, "One.mp4")).json()
    const pkg = { ...draft, bpm: 120, firstBeatSec: 0.5, trim: { start: 0, end: 4 } }
    expect((await fetch(`${base}/dances/${draft.id}`, { method: "PUT", body: JSON.stringify(pkg) })).status).toBe(200)
    expect((await arm(draft.id, { section: 2 })).res.status).toBe(422)
    const { res } = await record(draft.id, filmed(8, 1), { section: 1 })
    expect((await res.json()).take).toMatchObject({ name: "s1-t1", section: 1 })
    expect(await (await call("GET", `/dances/${draft.id}/takes?section=1`)).json()).toHaveLength(1)
  }, 120_000)

  it("stops listing a take deleted on the phone, so the glasses lose it the next time they list", async () => {
    const id = await readyDance()
    await record(id, filmed(8, 1))
    await record(id, filmed(8, 1))
    const names = async () => (await (await call("GET", `/dances/${id}/takes?section=2`)).json()).map((t: { name: string }) => t.name)
    expect(await names()).toEqual(["s2-t1", "s2-t2"])
    expect((await call("DELETE", `/dances/${id}/takes/s2-t1`)).status).toBe(200)
    expect(await names()).toEqual(["s2-t2"])
    // Its video is gone too, which is what a glasses still holding the old list would run into.
    expect((await call("GET", `/dances/${id}/takes/s2-t1.mp4`)).status).toBe(404)
  }, 120_000)

  it("fails the session with a reason on a bad upload, and keeps the raw upload", async () => {
    const id = await readyDance()
    const { session, res } = await record(id, Buffer.from("not a video, just words"))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/read/)
    expect((await status()).session).toMatchObject({ id: session.id, state: "failed", reason: expect.stringMatching(/read/) })
    expect(readdirSync(join(storage, id, "takes")).some((f) => f.startsWith("raw-"))).toBe(true)
    expect(await (await call("GET", `/dances/${id}/takes`)).json()).toEqual([])
  })

  it("ignores a stop before a start, and an upload nobody asked for", async () => {
    const id = await readyDance()
    const { session } = await arm(id)
    expect((await call("POST", `/takes/session/${session.id}/stop`)).status).toBe(422)
    expect((await call("POST", `/takes/session/${session.id}/upload`, filmed(8, 1))).status).toBe(422)
  })

  it("answers 404 for an unknown take, and delete removes the file and its listing", async () => {
    const id = await readyDance()
    expect((await call("GET", `/dances/${id}/takes/s2-t9.mp4`)).status).toBe(404)
    expect((await call("DELETE", `/dances/${id}/takes/s2-t9`)).status).toBe(404)
    await record(id, filmed(8, 1))
    const file = join(storage, id, "takes", "s2-t1.mp4")
    expect(existsSync(file)).toBe(true)
    expect((await call("DELETE", `/dances/${id}/takes/s2-t1`)).status).toBe(200)
    expect(existsSync(file)).toBe(false)
    expect(await (await call("GET", `/dances/${id}/takes`)).json()).toEqual([])
    expect((await call("GET", `/dances/${id}/takes/s2-t1.mp4`)).status).toBe(404)
    // A path that isn't a take name reaches nothing.
    expect((await call("GET", `/dances/${id}/takes/..%2Fpackage.json.mp4`)).status).toBe(404)
  }, 120_000)
})
