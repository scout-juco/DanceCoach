import { describe, expect, it } from "vitest"
import { CountClock } from "../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { NETWORK_ERROR } from "../server/page/phone/pairing"
import { difficultyLabel, fetchPackage, saveForLater, savePackage, sectionRows, summaryLine, thumbnailUrl } from "../server/page/phone/ready"
import { resolveRoute } from "../server/page/phone/router"
import { clearNudges, parseStart, sectionStarts, setSectionStart, startText, stepSectionStart } from "../server/page/phone/sections"
import { makeDance } from "./fixtures"

const reply = (status: number, body: unknown, seen?: (url: string, init?: RequestInit) => void) =>
  ((url: string, init?: RequestInit) => {
    seen?.(url, init)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as unknown as typeof fetch
const down = (() => Promise.reject(new Error("down"))) as unknown as typeof fetch

// 120 bpm: a section is 4 s. Trim 2–18, count 1 at 3: sections start at 3, 7, 11, 15 (the last is partial).
const dance = (over = {}) => makeDance({ title: "Pretty Boy", difficulty: "Intermediate", trim: { start: 2, end: 18 }, firstBeatSec: 3, ...over })

describe("the Ready screen's text", () => {
  it("sums up the routine, its sections and the dancer", () => {
    expect(summaryLine(dance())).toBe("0:16 · 4 sections · 1 dancer")
    expect(summaryLine(dance({ trim: { start: 2, end: 6 } }))).toBe("0:04 · 1 section · 1 dancer")
  })
  it("draws the difficulty with its dots", () => {
    expect(difficultyLabel("Intermediate")).toBe("●●○ MEDIUM")
    expect(difficultyLabel("Beginner")).toBe("●○○ EASY")
  })
  it("lists the full routine and each section with its time range, counted from the start of the routine", () => {
    expect(sectionRows(dance())).toEqual([
      { name: "Full routine", range: "0:00–0:16" },
      { name: "Section 1 · 8 counts", range: "0:01–0:05" },
      { name: "Section 2 · 8 counts", range: "0:05–0:09" },
      { name: "Section 3 · 8 counts", range: "0:09–0:13" },
      { name: "Section 4 · 6 counts", range: "0:13–0:16" },
    ])
  })
  it("uses the first still as the thumbnail, when there is one", () => {
    expect(thumbnailUrl(dance())).toBeUndefined()
    const stills = [Array.from({ length: 16 }, (_, i) => `s${i}.jpg`)]
    expect(thumbnailUrl(dance({ id: "ab", stills }))).toBe("/dances/ab/stills/s0.jpg")
  })
})

describe("the calls", () => {
  it("loads a dance's package, or says why not", async () => {
    let url = ""
    expect(await fetchPackage("a b", reply(200, dance(), (u) => (url = u)))).toMatchObject({ ok: true })
    expect(url).toBe("/dances/a%20b/package")
    expect(await fetchPackage("x", reply(404, { error: "There's no such dance." }))).toEqual({ ok: false, error: "There's no such dance." })
    expect(await fetchPackage("x", down)).toEqual({ ok: false, error: NETWORK_ERROR })
  })
  it("saves with the phone's token", async () => {
    let seen: { url: string; init?: RequestInit } | undefined
    const r = await savePackage(dance({ id: "ab" }), "tok", reply(200, {}, (url, init) => (seen = { url, init })))
    expect(r).toEqual({ ok: true })
    expect(seen?.url).toBe("/dances/ab")
    expect(seen?.init?.method).toBe("PUT")
    expect((seen?.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok")
  })
  it("Save for later sets saved and leaves the rest alone", async () => {
    let sent: any
    await saveForLater(dance({ id: "ab" }), "tok", reply(200, {}, (_u, init) => (sent = JSON.parse(String(init?.body)))))
    expect(sent).toMatchObject({ id: "ab", saved: true, title: "Pretty Boy", firstBeatSec: 3 })
  })
  it("shows a refused save", async () => {
    expect(await saveForLater(dance(), "tok", reply(401, { error: "Pair your phone again." }))).toEqual({ ok: false, error: "Pair your phone again." })
    expect(await saveForLater(dance(), "tok", down)).toEqual({ ok: false, error: NETWORK_ERROR })
  })
})

describe("nudging section starts", () => {
  const ok = (e: ReturnType<typeof setSectionStart>) => {
    if (!e.ok) throw new Error(e.error)
    return e.package
  }
  it("shows and reads starts as seconds into the routine", () => {
    expect(startText(dance(), 7)).toBe("5.00")
    expect(parseStart(dance(), "5.5")).toBe(7.5)
    expect(parseStart(dance(), "5,5")).toBe(7.5)
    expect(Number.isNaN(parseStart(dance(), ""))).toBe(true)
    expect(Number.isNaN(parseStart(dance(), "abc"))).toBe(true)
    expect(Number.isNaN(parseStart(dance(), "-1"))).toBe(true)
  })
  it("moves one section and the Lens counts it from there", () => {
    const p = ok(setSectionStart(dance(), 2, 7.5))
    const clock = new CountClock(p)
    expect(clock.sectionStart(2)).toBe(7.5)
    expect(clock.sectionStart(1)).toBe(3)
    expect(clock.sectionStart(3)).toBe(11)
    expect(clock.sectionCount).toBe(4)
  })
  it("moving section 1 moves count 1 too", () => {
    const p = ok(setSectionStart(dance(), 1, 3.2))
    expect(p.firstBeatSec).toBe(3.2)
    expect(sectionStarts(p)[0]).toBe(3.2)
  })
  it("keeps sections in order, inside the routine", () => {
    expect(setSectionStart(dance(), 2, 2.5)).toMatchObject({ ok: false, error: "Section 2 has to start after section 1." })
    expect(setSectionStart(dance(), 2, 11)).toMatchObject({ ok: false, error: "Section 2 has to start before section 3." })
    expect(setSectionStart(dance(), 4, 18)).toMatchObject({ ok: false })
    expect(setSectionStart(dance(), 1, 1)).toMatchObject({ ok: false, error: "A section can't start before the routine does." })
    expect(setSectionStart(dance(), 2, NaN)).toMatchObject({ ok: false })
    expect(setSectionStart(dance(), 9, 5)).toMatchObject({ ok: false, error: "There's no section 9." })
  })
  it("steps earlier and later, and stops at the neighbours", () => {
    const p = ok(stepSectionStart(dance(), 2, 0.1))
    expect(sectionStarts(p)[1]).toBeCloseTo(7.1)
    const q = ok(stepSectionStart(p, 2, -0.01))
    expect(sectionStarts(q)[1]).toBeCloseTo(7.09)
    expect(sectionStarts(ok(stepSectionStart(dance(), 2, -100)))[1]).toBeCloseTo(3.1)
    expect(sectionStarts(ok(stepSectionStart(dance(), 2, 100)))[1]).toBeCloseTo(10.9)
  })
  it("doesn't drift over many steps", () => {
    let p = dance()
    for (let i = 0; i < 10; i++) p = ok(stepSectionStart(p, 3, 0.1))
    expect(sectionStarts(p)[2]).toBeCloseTo(12)
  })
  it("pins every section, so a later one can't end up before a nudged one", () => {
    const p = ok(setSectionStart(dance(), 2, 10))
    expect(sectionStarts(p)).toEqual([3, 10, 11, 15])
    expect(p.sections).toHaveLength(4)
  })
  it("resets to the beat", () => {
    const p = clearNudges(ok(setSectionStart(dance(), 2, 7.5)))
    expect(p.sections).toBeUndefined()
    expect(sectionStarts(p)).toEqual([3, 7, 11, 15])
  })
})

describe("the routes", () => {
  it("keeps a dance's id on the Ready screen and its editor, and sends no token to pair", () => {
    expect(resolveRoute("#/dance/ab12", true)).toEqual({ route: "dance", hash: "#/dance/ab12", id: "ab12" })
    expect(resolveRoute("#/sections/ab12", true)).toEqual({ route: "sections", hash: "#/sections/ab12", id: "ab12" })
    expect(resolveRoute("#/sections/ab12", false).route).toBe("pair")
  })
})
