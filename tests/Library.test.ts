import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createIngestServer } from "../server/ingestServer"
import type { SpecsState } from "../server/link"
import { openDanceOnSpecs } from "../server/page/phone/commands"
import { metaLine, resumeChoice, resumeLine, resumeSection, tabContents, tabOf, trailingValue, withLiveProgress, type LibraryDance } from "../server/page/phone/library"
import { resolveRoute } from "../server/page/phone/router"
import { makeDance } from "./fixtures"

const dance = (id: string, o: Partial<LibraryDance> = {}): LibraryDance => ({ id, title: id.toUpperCase(), difficulty: "Intermediate", sections: 5, learned: [], added: 0, ...o })
const specs = (o: Partial<SpecsState> = {}): SpecsState => ({ section: 0, mode: "playthrough", speed: 1, mirror: false, running: false, lookbackRecording: false, finalRecording: false, progress: {}, ...o })

describe("the Library tabs", () => {
  const all = [
    dance("a", { learned: [1], added: 1 }),
    dance("b", { learned: [1, 2, 3, 4, 5], added: 2 }),
    dance("c", { saved: true, added: 3 }),
    dance("d", { added: 4 }),
    dance("e", { saved: true, learned: [2], added: 5 }),
  ]
  it("puts started and brand-new dances in progress, newest first", () => {
    expect(tabContents(all, "In progress").map((d) => d.id)).toEqual(["e", "d", "a"])
  })
  it("puts a dance with every section learned in Learned", () => {
    expect(tabContents(all, "Learned").map((d) => d.id)).toEqual(["b"])
  })
  it("keeps saved dances that are not started in Saved, until they are", () => {
    expect(tabContents(all, "Saved").map((d) => d.id)).toEqual(["c"])
    expect(tabOf(all[4])).toBe("In progress")
  })
  it("has empty tabs when nothing fits", () => {
    expect(tabContents([], "Saved")).toEqual([])
  })
  it("counts a learned section outside the dance as nothing", () => {
    expect(tabOf(dance("x", { sections: 3, learned: [7] }))).toBe("In progress")
  })
})

describe("a row", () => {
  it("shows 1/5, New or 4/4 ✓ on the right", () => {
    expect(trailingValue(dance("a", { learned: [1] }))).toBe("1/5")
    expect(trailingValue(dance("a"))).toBe("New")
    expect(trailingValue(dance("a", { sections: 4, learned: [1, 2, 3, 4] }))).toBe("4/4 ✓")
  })
  it("says Medium · 5 sections", () => {
    expect(metaLine(dance("a"))).toBe("Medium · 5 sections")
    expect(metaLine(dance("a", { difficulty: "Beginner", sections: 1 }))).toBe("Easy · 1 section")
    expect(metaLine(dance("a", { difficulty: "Spicy" }))).toBe("Spicy · 5 sections")
  })
  it("follows the Specs' live progress over the stored one", () => {
    const live = withLiveProgress([dance("a", { learned: [1] })], specs({ progress: { a: [1, 2] } }))
    expect(trailingValue(live[0])).toBe("2/5")
  })
})

describe("the resume card's choice", () => {
  const list = [dance("old", { learned: [1], added: 1 }), dance("new", { added: 9 }), dance("done", { learned: [1, 2, 3, 4, 5], added: 20 })]
  it("is the dance the Specs have open", () => {
    expect(resumeChoice(list, specs({ danceId: "old" }))?.id).toBe("old")
  })
  it("is the newest in progress when the Specs have nothing open, or something no longer there", () => {
    expect(resumeChoice(list)?.id).toBe("new")
    expect(resumeChoice(list, specs({ danceId: "gone" }))?.id).toBe("new")
  })
  it("is the newest dance when none is in progress", () => {
    expect(resumeChoice([list[2], dance("saved", { saved: true, added: 25 })])?.id).toBe("saved")
  })
  it("is nothing with no dances", () => {
    expect(resumeChoice([])).toBeUndefined()
  })
  it("resumes at the Specs' section and speed, else the first section not learned, at 1×", () => {
    const d = dance("old", { learned: [1, 2] })
    expect(resumeLine(d, specs({ danceId: "old", section: 2, speed: 0.75 }))).toBe("Section 2 of 5 · 0.75×")
    expect(resumeLine(d)).toBe("Section 3 of 5 · 1×")
    expect(resumeSection(d, specs({ danceId: "old", section: 0 }))).toBe(3)
    expect(resumeSection(d, specs({ danceId: "other", section: 4 }))).toBe(3)
  })
})

describe("the Library routes", () => {
  it("keeps a dance id and sends no-token phones to pair", () => {
    expect(resolveRoute("#/dance/ab12", true)).toEqual({ route: "dance", hash: "#/dance/ab12", id: "ab12" })
    expect(resolveRoute("#/dance/ab12", false).route).toBe("pair")
    expect(resolveRoute("#/add", true).route).toBe("add")
    expect(resolveRoute("#/practice", true).route).toBe("practice")
  })
})

describe("GET /dances and Practice on Specs", () => {
  const work = mkdtempSync(join(tmpdir(), "library-"))
  const server = createIngestServer({ storageDir: work })
  let base = ""
  const put = (id: string, o: object) => {
    mkdirSync(join(work, id), { recursive: true })
    writeFileSync(join(work, id, "package.json"), JSON.stringify(makeDance({ id, video: `${id}.mp4`, ...o })))
  }
  beforeAll(async () => {
    put("aaaaaaaaaaaa", {})
    put("bbbbbbbbbbbb", { saved: true })
    await new Promise<void>((ok) => server.listen(0, ok))
    base = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => {
    server.close()
    rmSync(work, { recursive: true, force: true })
  })
  const beat = (state?: object) => fetch(`${base}/link/specs/beat`, { method: "POST", body: JSON.stringify({ specsId: "s1", state }) }).then((r) => r.json())

  it("lists the saved flag, and no progress before a Specs is paired", async () => {
    const list = await (await fetch(`${base}/dances`)).json()
    expect(list.find((d: LibraryDance) => d.id === "bbbbbbbbbbbb")).toMatchObject({ saved: true, learned: [] })
    expect(list.find((d: LibraryDance) => d.id === "aaaaaaaaaaaa").saved).toBeUndefined()
    expect(list[0].added).toBeGreaterThan(0)
  })
  it("lists the learned sections the paired Specs reported, and Practice on Specs queues open-dance at that section", async () => {
    const { pairCode } = await beat()
    const { phoneToken } = await (await fetch(`${base}/link/pair`, { method: "POST", body: JSON.stringify({ code: pairCode }) })).json()
    await beat(specs({ danceId: "aaaaaaaaaaaa", section: 2, progress: { aaaaaaaaaaaa: [1] } }))
    const list = await (await fetch(`${base}/dances`)).json()
    expect(list.find((d: LibraryDance) => d.id === "aaaaaaaaaaaa").learned).toEqual([1])

    expect(await openDanceOnSpecs(phoneToken, "aaaaaaaaaaaa", 2, (url, init) => fetch(`${base}${url}`, init))).toEqual({ ok: true })
    const next = await beat()
    expect(next.commands).toEqual([expect.objectContaining({ type: "open-dance", danceId: "aaaaaaaaaaaa", section: 2 })])
  })
  it("says why when the command is refused", async () => {
    const result = await openDanceOnSpecs("wrong", "aaaaaaaaaaaa", 1, (url, init) => fetch(`${base}${url}`, init))
    expect(result).toMatchObject({ ok: false })
  })
})
