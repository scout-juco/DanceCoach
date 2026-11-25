import { describe, expect, it } from "vitest"
import type { SpecsState } from "../server/link"
import { NETWORK_ERROR } from "../server/page/phone/pairing"
import { agoText, deleteTake, downloadName, fetchTakes, groupTakes, modeChip, sectionLabel, showRecordingBanner, speedLabel, takeTitle, takeUrl } from "../server/page/phone/practice"
import { ARMED_WITHOUT_CAMERA, cameraProblem, TakeRecorder, TAIL_MS, type Beat, type Engine, type RecorderDeps, type UploadResult } from "../server/page/phone/recorder"
import { resolveRoute } from "../server/page/phone/router"
import type { Take } from "../server/takes"

const take = (section: number, number: number, over: Partial<Take> = {}): Take => ({
  name: section === 0 ? `full-t${number}` : `s${section}-t${number}`, section, number, speed: 1, mirror: false, created: "2026-11-25T12:00:00.000Z", offset: 0, ...over,
})
const state = (over: Partial<SpecsState> = {}): SpecsState => ({ danceId: "d", section: 2, mode: "lookback", speed: 0.75, mirror: false, running: false, lookbackRecording: false, finalRecording: false, progress: {}, ...over })

describe("the lookback list", () => {
  it("groups by section, highest section first, the whole routine last, and each section's takes newest first", () => {
    const groups = groupTakes([take(1, 1), take(2, 1), take(0, 1), take(2, 2), take(3, 1), take(2, 3)])
    expect(groups.map((g) => g.section)).toEqual([3, 2, 1, 0])
    expect(groups[1].takes.map((t) => t.number)).toEqual([3, 2, 1])
  })
  it("labels each group with its count", () => {
    const groups = groupTakes([take(2, 1), take(2, 2), take(1, 1), take(0, 1)])
    expect(groups.map((g) => g.label)).toEqual(["SECTION 2 · 2 TAKES", "SECTION 1 · 1 TAKE", "FULL ROUTINE · 1 TAKE"])
  })
  it("is empty with no takes", () => {
    expect(groupTakes([])).toEqual([])
  })
  it("names a take and says how long ago it was filmed", () => {
    expect(takeTitle(take(2, 2, { speed: 0.75 }))).toBe("Take 2 · 0.75×")
    expect(takeTitle(take(1, 1, { speed: 1 }))).toBe("Take 1 · 1×")
    const now = Date.parse("2026-11-25T12:00:00.000Z")
    expect(agoText("2026-11-25T11:59:40.000Z", now)).toBe("just now")
    expect(agoText("2026-11-25T11:55:00.000Z", now)).toBe("5 min ago")
    expect(agoText("2026-11-25T10:00:00.000Z", now)).toBe("2 h ago")
    expect(agoText("2026-11-22T12:00:00.000Z", now)).toBe("3 d ago")
  })
  it("points at the take's file and names a download", () => {
    expect(takeUrl("a b", take(2, 1))).toBe("/dances/a%20b/takes/s2-t1.mp4")
    expect(downloadName("Pretty Boy", take(2, 3))).toBe("Pretty Boy section 2 take 3.mp4")
    expect(downloadName("Pretty Boy", take(0, 1))).toBe("Pretty Boy full routine take 1.mp4")
  })
})

describe("the Now card", () => {
  it("mirrors section, mode and speed", () => {
    expect(sectionLabel(2)).toBe("Section 2")
    expect(sectionLabel(0)).toBe("Full routine")
    expect(speedLabel(0.75)).toBe("0.75×")
    expect(modeChip("lookback")).toEqual({ label: "Lookback", pink: true })
    expect(modeChip("pose")).toEqual({ label: "Pose", pink: false })
    expect(modeChip("playthrough")).toEqual({ label: "Playthrough", pink: false })
  })
  it("shows the pink banner only while a lookback is recording", () => {
    expect(showRecordingBanner(state({ lookbackRecording: true }))).toBe(true)
    expect(showRecordingBanner(state())).toBe(false)
    expect(showRecordingBanner(undefined)).toBe(false)
  })
  it("has a route", () => {
    expect(resolveRoute("#/practice", true).route).toBe("practice")
  })
})

const json = (status: number, body: unknown, seen?: (url: string, init?: RequestInit) => void) =>
  ((url: string, init?: RequestInit) => {
    seen?.(url, init)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as unknown as typeof fetch
const down = (() => Promise.reject(new Error("down"))) as unknown as typeof fetch

describe("the takes calls", () => {
  it("lists a dance's takes, or null when they can't be read", async () => {
    expect(await fetchTakes("d", json(200, [take(1, 1)]))).toHaveLength(1)
    expect(await fetchTakes("d", json(500, {}))).toBeNull()
    expect(await fetchTakes("d", down)).toBeNull()
  })
  it("deletes with the phone's token, and counts a take that is already gone", async () => {
    let seen: { url: string; init?: RequestInit } | undefined
    expect(await deleteTake("d", take(2, 1), "tok", json(200, { deleted: true }, (url, init) => (seen = { url, init })))).toEqual({ ok: true })
    expect(seen?.url).toBe("/dances/d/takes/s2-t1")
    expect(seen?.init).toMatchObject({ method: "DELETE", headers: { Authorization: "Bearer tok" } })
    expect(await deleteTake("d", take(2, 1), "tok", json(404, {}))).toEqual({ ok: true })
  })
  it("says why a delete failed", async () => {
    expect(await deleteTake("d", take(2, 1), "tok", json(401, { error: "Pair first." }))).toEqual({ ok: false, error: "Pair first." })
    expect(await deleteTake("d", take(2, 1), "tok", down)).toEqual({ ok: false, error: NETWORK_ERROR })
  })
})

/** A phone with a fake camera, recorder, clock and server (which runs 500 ms ahead of the phone). */
function rig(opts: { cameraError?: unknown } = {}) {
  let t = 1_000_000
  let beat: Beat = { session: null }
  const timers: { fn: () => void; at: number }[] = []
  const uploads: { sid: string; size: number; startedAt: number }[] = []
  const engines: { started: boolean; stopped: boolean; push: (b: Blob) => void }[] = []
  let uploadResult: UploadResult = { ok: true }
  let awake = 0
  let released = 0
  let cameras = 0
  const deps: RecorderDeps = {
    beat: async () => ({ ...beat, serverTime: t + 500 }),
    openCamera: async () => {
      if (opts.cameraError) throw opts.cameraError
      cameras++
      return {}
    },
    closeCamera: () => void cameras--,
    makeEngine: (_s, onData, onStop) => {
      const e = { started: false, stopped: false, push: onData }
      engines.push(e)
      const engine: Engine = {
        start: () => void (e.started = true),
        stop: () => {
          e.stopped = true
          onStop()
        },
        get active() {
          return e.started && !e.stopped
        },
        mimeType: "video/mp4",
      }
      return engine
    },
    upload: async (sid, body, startedAt) => {
      uploads.push({ sid, size: body.size, startedAt })
      return uploadResult
    },
    keepAwake: async () => {
      awake++
      return () => void released++
    },
    now: () => t,
    setTimer: (fn, ms) => timers.push({ fn, at: t + ms }),
    clearTimer: () => {},
  }
  let saved = 0
  const recorder = new TakeRecorder(deps, () => {}, () => saved++)
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  return {
    recorder, uploads, engines, settle,
    setBeat: (b: Beat) => (beat = b),
    setUpload: (r: UploadResult) => (uploadResult = r),
    advance: (ms: number) => {
      t += ms
      for (const x of timers.filter((x) => x.at <= t)) x.fn()
    },
    saved: () => saved, awake: () => awake, released: () => released, cameras: () => cameras,
  }
}
const armed = { id: "s1", danceId: "d", state: "armed" }

describe("the phone as the recorder", () => {
  it("opens the camera and keeps the screen awake", async () => {
    const r = rig()
    await r.recorder.start()
    await r.settle()
    expect(r.recorder.status.camera).toBe("open")
    expect(r.awake()).toBe(1)
  })
  it("films an armed take, and sends it once the Specs have stopped, after the tail", async () => {
    const r = rig()
    await r.recorder.start()
    r.setBeat({ session: armed })
    await r.recorder.tick()
    expect(r.recorder.status.recording).toBe(true)
    expect(r.engines[0].started).toBe(true)
    r.engines[0].push(new Blob(["abc"]))
    r.setBeat({ session: null })
    await r.recorder.tick()
    expect(r.recorder.status.recording).toBe(false)
    expect(r.engines[0].stopped).toBe(false) // still filming the tail
    r.advance(TAIL_MS)
    await r.settle()
    expect(r.uploads).toEqual([{ sid: "s1", size: 3, startedAt: expect.any(Number) }])
    expect(r.saved()).toBe(1)
    expect(r.recorder.status).toMatchObject({ uploading: false, message: "Take saved.", isError: false })
  })
  it("does not film twice for the same session", async () => {
    const r = rig()
    await r.recorder.start()
    r.setBeat({ session: armed })
    await r.recorder.tick()
    r.setBeat({ session: { ...armed, state: "recording" } })
    await r.recorder.tick()
    expect(r.engines).toHaveLength(1)
  })
  it("drops a take when another session replaces it", async () => {
    const r = rig()
    await r.recorder.start()
    r.setBeat({ session: armed })
    await r.recorder.tick()
    r.setBeat({ session: { ...armed, id: "s2" } })
    await r.recorder.tick()
    expect(r.engines[0].stopped).toBe(true)
    expect(r.engines).toHaveLength(2)
    expect(r.uploads).toHaveLength(0)
  })
  it("dates the recording in the server's time, not the phone's", async () => {
    const r = rig()
    await r.recorder.start()
    r.setBeat({ session: armed })
    await r.recorder.tick()
    r.setBeat({ session: null })
    await r.recorder.tick()
    r.advance(TAIL_MS)
    await r.settle()
    expect(r.uploads[0].startedAt).toBe(1_000_000 + 500)
  })
  it("reports a take that didn't save, and doesn't call it saved", async () => {
    const r = rig()
    r.setUpload({ ok: false, error: "That recording ended before the section started. Record again." })
    await r.recorder.start()
    r.setBeat({ session: armed })
    await r.recorder.tick()
    r.setBeat({ session: null })
    await r.recorder.tick()
    r.advance(TAIL_MS)
    await r.settle()
    expect(r.saved()).toBe(0)
    expect(r.recorder.status).toMatchObject({ isError: true, message: "That recording ended before the section started. Record again." })
  })
  it("says so when a take is armed and the camera is blocked", async () => {
    const r = rig({ cameraError: Object.assign(new Error("x"), { name: "NotAllowedError" }) })
    await r.recorder.start()
    expect(r.recorder.status).toMatchObject({ camera: "blocked", isError: true })
    expect(r.recorder.status.message).toBe(cameraProblem({ name: "NotAllowedError" }))
    r.setBeat({ session: armed })
    await r.recorder.tick()
    expect(r.recorder.status.message).toBe(ARMED_WITHOUT_CAMERA)
    expect(r.engines).toHaveLength(0)
  })
  it("gives the camera and the screen back when it stops, dropping a take in progress", async () => {
    const r = rig()
    await r.recorder.start()
    await r.settle()
    r.setBeat({ session: armed })
    await r.recorder.tick()
    r.recorder.stop()
    expect(r.engines[0].stopped).toBe(true)
    expect(r.uploads).toHaveLength(0)
    expect(r.cameras()).toBe(0)
    expect(r.released()).toBe(1)
  })
})
