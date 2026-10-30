import { describe, expect, it } from "vitest"
import { planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { CountClock } from "../DanceCoachLens/Assets/Scripts/Core/CountClock"
import { DancePackage, loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { DanceSource } from "../DanceCoachLens/Assets/Scripts/Core/DanceSource"
import { PlaybackController } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { TEST_DANCE } from "../DanceCoachLens/Assets/Dance/TestDance"

/** A source that serves a copy of the given dances, with no clips. */
function fakeSource(dances: DancePackage[]): DanceSource<never> {
  const copies = dances.map((d) => loadDancePackage(JSON.parse(JSON.stringify(d))))
  return {
    list: async () => copies.map((d) => ({ id: d.id, title: d.title })),
    load: async (name) => {
      const dance = copies.find((d) => d.id === name)
      if (!dance) throw new Error(`No dance named "${name}"`)
      return { dance, clips: null, stills: null }
    },
  }
}

const options = { settings: undefined, firstLookSeen: false, finishReady: false } as never

describe("DanceSource", () => {
  const source = fakeSource([TEST_DANCE])

  it("lists the dances it has", async () => {
    expect(await source.list()).toEqual([{ id: "test-dance", title: "Test dance" }])
  })

  it("rejects for a dance it doesn't have", async () => {
    await expect(source.load("nope")).rejects.toThrow(/nope/)
  })

  it("loads a dance with the same sections, counts and lead-ins as the test dance", async () => {
    const { dance } = await source.load("test-dance")
    const loaded = new CountClock(dance)
    const direct = new CountClock(TEST_DANCE)
    expect(loaded.sectionCount).toBe(direct.sectionCount)
    for (let n = 1; n <= direct.sectionCount; n++) {
      expect(loaded.sectionStart(n)).toBe(direct.sectionStart(n))
      expect(loaded.sectionEnd(n)).toBe(direct.sectionEnd(n))
      expect(loaded.leadIn(n)).toEqual(direct.leadIn(n))
    }
    for (let t = 10; t < 36; t += 0.1) expect(loaded.at(t)).toEqual(direct.at(t))
    expect(planClips(dance)).toEqual(planClips(TEST_DANCE))
  })

  it("plays the loaded dance the way the test dance plays", async () => {
    const { dance } = await source.load("test-dance")
    expect(new PlaybackController(dance, options).open()).toEqual(new PlaybackController(TEST_DANCE, options).open())
  })
})
