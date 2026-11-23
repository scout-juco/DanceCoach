import { describe, expect, it } from "vitest"
import { danceStatus, detailsText, filterDances, levelLabel, statusText } from "../DanceCoachLens/Assets/Scripts/Core/DanceCards"
import { DanceListing } from "../DanceCoachLens/Assets/Scripts/Core/DanceSource"
import { decodeDoneSections, doneSectionsKey, encodeDoneSections, finishReadyKey, firstLookKey } from "../DanceCoachLens/Assets/Scripts/Core/SettingsStore"

describe("saved done sections", () => {
  it("round-trips through the store's string", () => {
    expect(decodeDoneSections(encodeDoneSections([1, 2, 4]))).toEqual([1, 2, 4])
    expect(decodeDoneSections(encodeDoneSections([]))).toEqual([])
  })

  it("is keyed per dance, beside the first look and finish ready keys", () => {
    expect(doneSectionsKey("a")).not.toBe(doneSectionsKey("b"))
    expect(new Set([doneSectionsKey("a"), firstLookKey("a"), finishReadyKey("a")]).size).toBe(3)
  })

  it("reads nothing, or damage, as no sections done", () => {
    for (const raw of [null, undefined, "", "not json", "{}", '"1"']) expect(decodeDoneSections(raw)).toEqual([])
  })

  it("keeps only whole section numbers in range, once each, in order", () => {
    expect(decodeDoneSections("[3,1,1,0,2.5,\"x\",9,2]", 4)).toEqual([1, 2, 3])
  })
})

describe("a dance's status", () => {
  it("is New with nothing done", () => {
    expect(danceStatus([], 4)).toEqual({ kind: "new" })
    expect(statusText(danceStatus([], 4))).toBe("New")
  })

  it("is in progress with some done", () => {
    expect(danceStatus([1, 2], 4)).toEqual({ kind: "inProgress", learned: 2, total: 4 })
    expect(statusText(danceStatus([1, 2], 4))).toBe("2/4 sections learned")
  })

  it("is done with every section done", () => {
    expect(danceStatus([1, 2, 3], 3)).toEqual({ kind: "done", total: 3 })
    expect(statusText(danceStatus([1, 2, 3], 3))).toBe("3/3 sections learned ✓")
  })

  it("ignores sections the dance doesn't have", () => {
    expect(danceStatus([7], 3)).toEqual({ kind: "new" })
  })
})

describe("the filters", () => {
  const dance = (id: string, difficulty?: string): DanceListing => ({ id, title: id, difficulty })
  const all = [dance("a", "Beginner"), dance("b", "Medium"), dance("c", "Advanced"), dance("d", "easy"), dance("e")]
  const ids = (l: DanceListing[]) => l.map((d) => d.id)

  it("All shows every dance", () => expect(ids(filterDances(all, "All"))).toEqual(["a", "b", "c", "d", "e"]))
  it("Easy shows beginner and easy dances", () => expect(ids(filterDances(all, "Easy"))).toEqual(["a", "d"]))
  it("Medium shows only medium dances", () => expect(ids(filterDances(all, "Medium"))).toEqual(["b"]))
  it("Hard shows advanced and hard dances", () => expect(ids(filterDances(all, "Hard"))).toEqual(["c"]))
})

describe("card text", () => {
  it("labels the level with dots", () => {
    expect(levelLabel("Intermediate")).toBe("●●○ INTERMEDIATE")
    expect(levelLabel("hard")).toBe("●●● HARD")
    expect(levelLabel(undefined)).toBe("")
  })

  it("gives the length and the section count", () => {
    expect(detailsText({ id: "a", title: "a", sections: 4, lengthSec: 185 })).toBe("3:05 · 4 sections")
    expect(detailsText({ id: "a", title: "a", sections: 1 })).toBe("1 section")
    expect(detailsText({ id: "a", title: "a" })).toBe("")
  })
})
