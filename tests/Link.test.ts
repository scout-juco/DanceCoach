import { describe, expect, it } from "vitest"
import { AuthError, COMMAND_EXPIRY_MS, Link, LinkError, PAIR_CODE_MS, SpecsState, WRONG_CODE_MESSAGE } from "../server/link"

const state = (extra: Partial<SpecsState> = {}): SpecsState => ({
  section: 1, mode: "playthrough", speed: 1, mirror: false, running: false, lookbackRecording: false, finalRecording: false, progress: {}, ...extra,
})

function setup() {
  let t = 1_000_000
  let n = 0
  const link = new Link({ now: () => t, makeCode: () => String(1000 + n++) })
  return { link, advance: (ms: number) => (t += ms) }
}

/** A Specs and a phone, paired. */
function paired() {
  const s = setup()
  const { pairCode } = s.link.specsBeat("specs-1", state())
  const { phoneToken } = s.link.pair(pairCode)
  return { ...s, token: phoneToken }
}

describe("pairing codes", () => {
  it("gives an unpaired Specs a 4-digit code and keeps it until it expires, then refreshes it", () => {
    const { link, advance } = setup()
    const first = link.specsBeat("specs-1", state())
    expect(first).toMatchObject({ paired: false, phoneConnected: false, commands: [] })
    expect(first.pairCode).toMatch(/^\d{4}$/)
    advance(PAIR_CODE_MS)
    expect(link.specsBeat("specs-1", state()).pairCode).toBe(first.pairCode)
    advance(1)
    const next = link.specsBeat("specs-1", state()).pairCode
    expect(next).toMatch(/^\d{4}$/)
    expect(next).not.toBe(first.pairCode)
  })

  it("makes real 4-digit codes by default", () => {
    expect(new Link().specsBeat("s", state()).pairCode).toMatch(/^\d{4}$/)
  })

  it("pairs with the right code and stops showing it", () => {
    const { link } = setup()
    const { pairCode } = link.specsBeat("specs-1", state())
    const { phoneToken } = link.pair(pairCode)
    expect(phoneToken.length).toBeGreaterThan(20)
    const beat = link.specsBeat("specs-1", state())
    expect(beat.paired).toBe(true)
    expect(beat.pairCode).toBeUndefined()
  })

  it("refuses a wrong code with a readable message", () => {
    const { link } = setup()
    link.specsBeat("specs-1", state())
    expect(() => link.pair("0000")).toThrow(WRONG_CODE_MESSAGE)
    expect(() => link.pair(undefined)).toThrow(LinkError)
  })

  it("refuses an expired code", () => {
    const { link, advance } = setup()
    const { pairCode } = link.specsBeat("specs-1", state())
    advance(PAIR_CODE_MS + 1)
    expect(() => link.pair(pairCode)).toThrow(WRONG_CODE_MESSAGE)
  })

  it("a code works once", () => {
    const { link } = setup()
    const { pairCode } = link.specsBeat("specs-1", state())
    link.pair(pairCode)
    expect(() => link.pair(pairCode)).toThrow(WRONG_CODE_MESSAGE)
  })

  it("pairing again replaces the old phone", () => {
    const { link, token } = paired()
    const { pairCode } = link.specsBeat("specs-1", state(), true)
    expect(pairCode).toMatch(/^\d{4}$/)
    const second = link.pair(pairCode).phoneToken
    expect(second).not.toBe(token)
    expect(link.phoneBeat(token).specs).toBe("unpaired")
    expect(link.phoneBeat(second).specs).toBe("connected")
    expect(() => link.command(token, { type: "end-session" })).toThrow(AuthError)
  })

  it("a different Specs pairing replaces the old pairing", () => {
    const { link, token } = paired()
    const { pairCode } = link.specsBeat("specs-2", state())
    const fresh = link.pair(pairCode).phoneToken
    expect(link.phoneBeat(token).specs).toBe("unpaired")
    expect(link.phoneBeat(fresh).specs).toBe("connected")
    expect(link.specsBeat("specs-1", state()).paired).toBe(false)
  })
})

describe("connected and not connected", () => {
  it("the phone sees the Specs as connected up to 3 s after their beat, and not after", () => {
    const { link, advance, token } = paired()
    advance(3000)
    expect(link.phoneBeat(token).specs).toBe("connected")
    advance(1)
    expect(link.phoneBeat(token).specs).toBe("not-connected")
    link.specsBeat("specs-1", state())
    expect(link.phoneBeat(token).specs).toBe("connected")
  })

  it("the Specs see the phone as connected up to 3 s after its beat, and not after", () => {
    const { link, advance, token } = paired()
    expect(link.specsBeat("specs-1", state()).phoneConnected).toBe(false)
    link.phoneBeat(token)
    advance(3000)
    expect(link.specsBeat("specs-1", state()).phoneConnected).toBe(true)
    advance(1)
    expect(link.specsBeat("specs-1", state()).phoneConnected).toBe(false)
  })

  it("a phone with no or a wrong token is unpaired and doesn't count as connected", () => {
    const { link } = paired()
    expect(link.phoneBeat(undefined).specs).toBe("unpaired")
    expect(link.phoneBeat("nope")).toMatchObject({ specs: "unpaired" })
    expect(link.phoneBeat("nope").state).toBeUndefined()
    expect(link.phoneConnected()).toBe(false)
  })

  it("a phone that doesn't say who it is still counts for the Specs' connected flag", () => {
    const { link, advance } = setup()
    link.phoneSeen()
    expect(link.phoneConnected()).toBe(true)
    advance(3001)
    expect(link.phoneConnected()).toBe(false)
  })
})

describe("state and progress", () => {
  it("the phone reads the Specs' latest state", () => {
    const { link, token } = paired()
    link.specsBeat("specs-1", state({ danceId: "d1", section: 3, mode: "pose", speed: 0.75, mirror: true, running: true }))
    expect(link.phoneBeat(token).state).toMatchObject({ danceId: "d1", section: 3, mode: "pose", speed: 0.75, mirror: true, running: true })
  })

  it("keeps the last state, with progress, while the Specs are away", () => {
    const { link, advance, token } = paired()
    link.specsBeat("specs-1", state({ progress: { d1: [1, 2], d2: [] } }))
    advance(60_000)
    const beat = link.phoneBeat(token)
    expect(beat.specs).toBe("not-connected")
    expect(beat.state?.progress).toEqual({ d1: [1, 2], d2: [] })
  })

  it("a beat without a usable state leaves the last one alone", () => {
    const { link, token } = paired()
    link.specsBeat("specs-1", state({ section: 4 }))
    link.specsBeat("specs-1", null)
    expect(link.phoneBeat(token).state?.section).toBe(4)
  })
})

describe("commands", () => {
  it("needs a token", () => {
    const { link } = paired()
    expect(() => link.command(undefined, { type: "end-session" })).toThrow(AuthError)
    expect(() => link.command("nope", { type: "end-session" })).toThrow(AuthError)
  })

  it("delivers in order, repeats until acked, and an ack clears only that one", () => {
    const { link, token } = paired()
    const a = link.command(token, { type: "open-dance", danceId: "d1", section: 2 })
    const b = link.command(token, { type: "end-session" })
    expect(link.specsBeat("specs-1", state()).commands).toEqual([a, b])
    expect(link.specsBeat("specs-1", state()).commands).toEqual([a, b])
    link.ack("specs-1", a.id)
    expect(link.specsBeat("specs-1", state()).commands).toEqual([b])
    link.ack("specs-1", b.id)
    expect(link.specsBeat("specs-1", state()).commands).toEqual([])
  })

  it("drops commands after 30 s", () => {
    const { link, advance, token } = paired()
    link.command(token, { type: "end-session" })
    advance(COMMAND_EXPIRY_MS)
    const fresh = link.command(token, { type: "open-dance", danceId: "d1" })
    expect(link.specsBeat("specs-1", state()).commands).toHaveLength(2)
    advance(1)
    expect(link.specsBeat("specs-1", state()).commands).toEqual([fresh])
  })

  it("refuses commands the Specs wouldn't know", () => {
    const { link, token } = paired()
    for (const bad of [null, {}, { type: "reboot" }, { type: "open-dance" }, { type: "open-dance", danceId: "d1", section: -1 }, { type: "open-dance", danceId: "d1", section: "2" }]) {
      expect(() => link.command(token, bad)).toThrow(LinkError)
    }
  })

  it("commands for a replaced pairing are not handed to a later Specs", () => {
    const { link, token } = paired()
    link.command(token, { type: "end-session" })
    const { pairCode } = link.specsBeat("specs-2", state())
    link.pair(pairCode)
    expect(link.specsBeat("specs-2", state()).commands).toEqual([])
  })
})

describe("write access", () => {
  it("is open until something is paired, then needs the token", () => {
    const { link } = setup()
    expect(link.mayWrite(undefined)).toBe(true)
    const { pairCode } = link.specsBeat("specs-1", state())
    const { phoneToken } = link.pair(pairCode)
    expect(link.mayWrite(undefined)).toBe(false)
    expect(link.mayWrite("nope")).toBe(false)
    expect(link.mayWrite(phoneToken)).toBe(true)
  })
})
