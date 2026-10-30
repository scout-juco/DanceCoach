import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { planStills, stillAssetName, stillNames } from "../DanceCoachLens/Assets/Scripts/Core/StillPlan"
import { lastFrameSec, stillJobs } from "../scripts/cutStills"
import { makeDance } from "./fixtures"

// 120 bpm, first beat at 1 s, trim 0–13: 3 sections starting at 1, 5 and 9; the last runs 9–13 (full).
const names = (n: number) => Array.from({ length: 16 }, (_, i) => `still${n}_${i}.jpg`)

describe("loadDancePackage stills", () => {
  const load = (stills: unknown) => () => loadDancePackage({ ...makeDance(), stills })

  it("accepts a stills field with 16 names per section, and no stills field at all", () => {
    expect(load([names(1), names(2), names(3)])).not.toThrow()
    expect(() => loadDancePackage(makeDance())).not.toThrow()
  })

  it("rejects a wrong count per section", () => {
    expect(load([names(1).slice(0, 15)])).toThrow(/stills\[0\] must list 16/)
    expect(load([names(1), [...names(2), "extra.jpg"]])).toThrow(/stills\[1\] must list 16/)
    expect(load([[]])).toThrow(/stills\[0\]/)
  })

  it("rejects names that aren't non-empty strings, and a stills field that isn't a list of lists", () => {
    expect(load([[...names(1).slice(0, 15), 7]])).toThrow(/only file names/)
    expect(load([[...names(1).slice(0, 15), ""]])).toThrow(/only file names/)
    expect(load("nope")).toThrow(/stills/)
    expect(load([])).toThrow(/stills/)
    expect(load(["not a list"])).toThrow(/stills\[0\]/)
  })
})

describe("planStills", () => {
  const plan = planStills(makeDance())

  it("plans 16 stills per section, a half-count apart from the section start", () => {
    expect(plan.length).toBe(48)
    expect(plan.slice(0, 3).map((s) => [s.section, s.index, s.time])).toEqual([[1, 0, 1], [1, 1, 1.25], [1, 2, 1.5]])
    expect(plan[15].time).toBeCloseTo(4.75)
    expect(plan[16]).toMatchObject({ section: 2, index: 0, time: 5 })
  })

  it("follows nudged section starts, counting on their own grid", () => {
    const nudged = planStills(makeDance({ sections: [{ start: 1 }, { start: 5.5 }, { start: 9 }] }))
    expect(nudged[16].time).toBe(5.5)
    expect(nudged[17].time).toBe(5.75)
  })

  it("names stills by video, section and count, with an 'and' for each &", () => {
    expect(stillAssetName("Go Dance.mp4", 2, 0)).toBe("Go Dance_pose2_1.jpg")
    expect(stillAssetName("fixture.mp4", 1, 5)).toBe("fixture_pose1_3and.jpg")
    const listed = stillNames(makeDance())
    expect(listed.map((s) => s.length)).toEqual([16, 16, 16])
    expect(listed[0].slice(0, 4)).toEqual(["fixture_pose1_1.jpg", "fixture_pose1_1and.jpg", "fixture_pose1_2.jpg", "fixture_pose1_2and.jpg"])
    expect(new Set(listed.flat()).size).toBe(48)
    expect(() => loadDancePackage({ ...makeDance(), stills: listed })).not.toThrow()
  })
})

describe("stillJobs", () => {
  it("cuts one frame per still from its time, into the output folder", () => {
    const jobs = stillJobs(makeDance(), join("in", "up.mp4"), "out", 13)
    expect(jobs.length).toBe(48)
    const { still, args } = jobs[1]
    expect(still.file).toBe(join("out", "fixture_pose1_1and.jpg"))
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 2)).toEqual(["-ss", "1.250"])
    expect(args).toContain(join("in", "up.mp4"))
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1")
  })

  it("holds counts past the end of the trim, or of the footage, on the last frame", () => {
    // Trim ends at 11: section 3 (9–13) has counts past it.
    const short = makeDance({ trim: { start: 0, end: 11 } })
    const last = lastFrameSec(short, 13)
    expect(last).toBeLessThan(11)
    const times = stillJobs(short, "up.mp4", "out", 13).map((j) => j.still.time)
    expect(times[32 + 15]).toBe(last)
    expect(times[32 + 8]).toBe(last) // 11.0 s exactly
    expect(times[32 + 7]).toBeCloseTo(10.75) // before the end: untouched
    // Footage shorter than the trim: the footage's end wins.
    expect(lastFrameSec(makeDance(), 12)).toBeLessThan(12)
  })
})
