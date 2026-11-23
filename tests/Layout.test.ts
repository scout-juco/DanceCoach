import { describe, expect, it } from "vitest"
import { ScreenId } from "../DanceCoachLens/Assets/Scripts/Core/PlaybackController"
import { FLOATING_PANELS, PanelId, panelsFor, PxRect, SCREENS } from "../DanceCoachLens/Assets/Scripts/UI/Layout"

// The B2 frame is 1280×800 on a 4 px grid, with spacing tiers (BUILD_SPEC §5): surfaces 24 apart,
// bars attached 16 under the video, the count-in column 32 beside it.

const ids = Object.keys(SCREENS) as ScreenId[]
const fullRun = panelsFor({ screen: "B", runKind: "full" })
const boards: [string, Partial<Record<PanelId, PxRect>>][] = [...ids.map((id) => [id, SCREENS[id]] as [string, Partial<Record<PanelId, PxRect>>]), ["B (Full run)", fullRun]]

const right = (r: PxRect) => r[0] + r[2]
const bottom = (r: PxRect) => r[1] + r[3]
/** The gap from a to b when b sits below a, and when b sits right of a. */
const gapBelow = (a: PxRect, b: PxRect) => b[1] - bottom(a)
const gapRight = (a: PxRect, b: PxRect) => b[0] - right(a)
/** True when the two rects' spans overlap on x (they face each other vertically) or on y. */
const overlapX = (a: PxRect, b: PxRect) => a[0] < right(b) && b[0] < right(a)
const overlapY = (a: PxRect, b: PxRect) => a[1] < bottom(b) && b[1] < bottom(a)

describe("Layout on the B2 grid", () => {
  it("puts every rect on every screen on the 4 px grid, inside the 1280×800 frame", () => {
    for (const [id, panels] of boards) {
      for (const [panel, rect] of Object.entries(panels) as [PanelId, PxRect][]) {
        rect.forEach((v) => expect(v % 4, `${id}.${panel} = [${rect}]`).toBe(0))
        expect(rect[0] >= 0 && rect[1] >= 0 && right(rect) <= 1280 && bottom(rect) <= 800, `${id}.${panel} inside the frame`).toBe(true)
      }
    }
  })

  it("never overlaps two panels on the board", () => {
    for (const [id, panels] of boards) {
      const board = (Object.entries(panels) as [PanelId, PxRect][]).filter(([p]) => FLOATING_PANELS.indexOf(p) < 0)
      for (let i = 0; i < board.length; i++)
        for (let j = i + 1; j < board.length; j++) {
          const [pa, a] = board[i]
          const [pb, b] = board[j]
          expect(overlapX(a, b) && overlapY(a, b), `${id}: ${pa} overlaps ${pb}`).toBe(false)
        }
    }
  })

  it("keeps the video at x 792 in one of its three sizes", () => {
    const sizes = ["340x604", "300x520", "300x504"]
    for (const [id, panels] of boards) {
      const v = panels.video!
      expect(v[0], id).toBe(792)
      expect(v[1], id).toBe(40)
      expect(sizes, id).toContain(`${v[2]}x${v[3]}`)
    }
  })

  it("attaches the progress and section bars 16 under the video, full width", () => {
    for (const [id, panels] of boards) {
      const bar = panels.progress || panels.segBar
      if (!bar) continue
      expect(gapBelow(panels.video!, bar), id).toBe(16)
      expect([bar[0], bar[2]], id).toEqual([panels.video![0], panels.video![2]])
    }
  })

  it("puts surfaces that sit together 24 apart", () => {
    const pairs: [ScreenId, PanelId, "below" | "right", PanelId][] = [
      ["C", "video", "below", "sections"],
      ["C", "sections", "below", "controls"],
      ["C2", "video", "below", "sections"],
      ["C2", "sections", "below", "controls"],
      ["D", "video", "below", "poseLine"],
      ["D", "poseLine", "below", "controls"],
      ["E", "video", "below", "poseBar"],
      ["I", "lookPanel", "right", "video"],
      ["I", "video", "below", "controls"],
      ["L", "lookPanel", "right", "video"],
      ["L", "video", "below", "controls"],
      ["J", "lookPanel", "right", "video"],
      ["M", "take", "right", "video"],
      ["PV", "segBar", "below", "skip"],
    ]
    for (const [id, a, dir, b] of pairs) {
      const ra = SCREENS[id][a]!
      const rb = SCREENS[id][b]!
      expect(dir === "below" ? gapBelow(ra, rb) : gapRight(ra, rb), `${id}: ${a} → ${b}`).toBe(24)
    }
  })

  it("keeps facing surfaces at least 24 apart, apart from bars attached to the video", () => {
    const attached: PanelId[] = ["progress", "segBar", "sbsBar", "skip"]
    for (const [id, panels] of boards) {
      const board = (Object.entries(panels) as [PanelId, PxRect][]).filter(([p]) => FLOATING_PANELS.indexOf(p) < 0 && attached.indexOf(p) < 0)
      for (const [pa, a] of board)
        for (const [pb, b] of board) {
          if (pa === pb) continue
          if (overlapX(a, b) && b[1] >= bottom(a)) expect(gapBelow(a, b), `${id}: ${pa} above ${pb}`).toBeGreaterThanOrEqual(24)
          if (overlapY(a, b) && b[0] >= right(a)) expect(gapRight(a, b), `${id}: ${pa} left of ${pb}`).toBeGreaterThanOrEqual(24)
        }
    }
  })

  it("right-aligns the mode panel, section tiles and Skip to the video", () => {
    for (const [id, panels] of boards) {
      const edge = right(panels.video!)
      for (const p of ["controls", "sections", "skip", "poseBar"] as PanelId[]) {
        const r = panels[p]
        if (r) expect(right(r), `${id}.${p}`).toBe(edge)
      }
    }
  })

  it("puts the Lookback countdown column 32 left of the video", () => {
    expect(gapRight(SCREENS.K.countdown!, SCREENS.K.video!)).toBe(32)
    expect(SCREENS.K.countdown![2]).toBe(152)
  })

  it("lays side by side out on Lookback's board: the take in the side panel's place, the play bar 16 under both", () => {
    const { video, take, sbsBar } = SCREENS.M
    expect(video).toEqual(SCREENS.L.video)
    expect(take).toEqual(SCREENS.L.lookPanel)
    expect(gapBelow(video!, sbsBar!)).toBe(16)
    expect([sbsBar![0], right(sbsBar!)]).toEqual([take![0], right(video!)])
  })

  it("centres the dialogs in the frame", () => {
    for (const id of ["G", "J"] as ScreenId[]) {
      const p = SCREENS[id].popup!
      expect(p[0] * 2 + p[2], id).toBe(1280)
      expect(p[1] * 2 + p[3], id).toBe(800)
    }
  })
})
