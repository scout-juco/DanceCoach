import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { clipJobs } from "../scripts/cutClips"
import { makeDance } from "./fixtures"

describe("clipJobs", () => {
  const jobs = clipJobs(makeDance(), join("in", "upload-123.mp4"), "out")

  it("reports one clip per planned clip, with its id, file, start and end", () => {
    expect(jobs.map((j) => j.clip)).toEqual([
      { id: "top", file: join("out", "fixture_top.mp4"), start: 1, end: 13 },
      { id: "s2", file: join("out", "fixture_s2.mp4"), start: 3, end: 9 },
      { id: "s3", file: join("out", "fixture_s3.mp4"), start: 7, end: 13 },
    ])
  })

  it("names clips after the package's video, not the source file", () => {
    for (const { args } of jobs) {
      expect(args).toContain(join("in", "upload-123.mp4"))
      expect(args[args.length - 1]).toMatch(/fixture_\w+\.mp4$/)
    }
  })

  it("cuts each clip from its start for its length", () => {
    const { args } = jobs[1]
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 2)).toEqual(["-ss", "3.000"])
    expect(args.slice(args.indexOf("-t"), args.indexOf("-t") + 2)).toEqual(["-t", "6.000"])
  })
})
