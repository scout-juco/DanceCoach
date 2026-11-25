import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createIngestServer } from "../server/ingestServer"
import { LinkPoller, statusFromBeat, STATUS_LABEL, type PollerDeps } from "../server/page/phone/linkState"
import { cleanCode } from "../server/page/phone/pairing"
import { parseRoute, resolveRoute } from "../server/page/phone/router"

describe("the route guard", () => {
  it("sends everything but pair and kit to pair when there is no token", () => {
    expect(resolveRoute("", false)).toEqual({ route: "pair", hash: "#/pair" })
    expect(resolveRoute("#/", false).route).toBe("pair")
    expect(resolveRoute("#/nowhere", false).route).toBe("pair")
    expect(resolveRoute("#/kit", false).route).toBe("kit")
    expect(resolveRoute("#/pair", false).route).toBe("pair")
  })
  it("lets a paired phone in, and keeps it off the pair screen", () => {
    expect(resolveRoute("", true)).toEqual({ route: "home", hash: "#/" })
    expect(resolveRoute("#/pair", true).route).toBe("home")
    expect(resolveRoute("#/kit", true).route).toBe("kit")
  })
  it("reads a hash with a query", () => {
    expect(parseRoute("#/kit?x=1")).toBe("kit")
  })
})

describe("status from a beat", () => {
  it("is what the server said", () => {
    expect(statusFromBeat({ specs: "connected" })).toMatchObject({ status: "connected", serverDown: false })
    expect(statusFromBeat({ specs: "not-connected" }).status).toBe("not-connected")
    expect(statusFromBeat({ specs: "unpaired" }).status).toBe("unpaired")
  })
  it("is not connected, and says so, when the server cannot be reached", () => {
    expect(statusFromBeat(null)).toEqual({ status: "not-connected", serverDown: true })
  })
  it("has one wording", () => {
    expect(STATUS_LABEL["not-connected"]).toBe("Not connected")
  })
})

describe("the poller", () => {
  const make = (replies: (() => Promise<any>)[], start: string | null = "tok") => {
    let token = start
    const timers: (() => void)[] = []
    const deps: PollerDeps = {
      getToken: () => token,
      setToken: (t) => (token = t),
      fetchJson: () => replies.shift()!(),
      isVisible: () => true,
      setTimer: (fn) => timers.push(fn),
      clearTimer: () => {},
    }
    return { poller: new LinkPoller(deps), token: () => token, timers }
  }
  it("flips to not connected when the Specs go quiet, and back", async () => {
    const { poller } = make([async () => ({ specs: "connected" }), async () => ({ specs: "not-connected" }), async () => ({ specs: "connected" })])
    await poller.beat()
    expect(poller.snapshot.status).toBe("connected")
    await poller.beat()
    expect(poller.snapshot.status).toBe("not-connected")
    await poller.beat()
    expect(poller.snapshot.status).toBe("connected")
  })
  it("treats a failed request as not connected, keeping the token", async () => {
    const { poller, token } = make([async () => Promise.reject(new Error("offline"))])
    await poller.beat()
    expect(poller.snapshot).toMatchObject({ status: "not-connected", serverDown: true })
    expect(token()).toBe("tok")
  })
  it("drops a token the server no longer knows", async () => {
    const { poller, token } = make([async () => ({ specs: "unpaired" })])
    await poller.beat()
    expect(token()).toBeNull()
    expect(poller.snapshot.status).toBe("unpaired")
  })
  it("does not call the server without a token", async () => {
    const { poller } = make([], null)
    await poller.beat()
    expect(poller.snapshot.status).toBe("unpaired")
  })
  it("schedules the next beat after each tick", async () => {
    const { poller, timers } = make([async () => ({ specs: "connected" })])
    poller.start()
    await new Promise((r) => setTimeout(r, 0))
    expect(timers).toHaveLength(1)
    poller.stop()
  })
})

describe("the code field", () => {
  it("keeps four digits", () => {
    expect(cleanCode("12a3-456")).toBe("1234")
  })
})

describe("the theme", () => {
  it("has every colour token from tokens.json", () => {
    const tokens = JSON.parse(readFileSync("design/phone-handoff/tokens.json", "utf8"))
    const css = readFileSync("server/page/phone/theme.css", "utf8")
    for (const t of tokens.color.tokens) {
      const value = t.value.startsWith("#") ? t.value.toUpperCase() : t.value.replace(/,/g, ", ")
      expect(css, t.name).toContain(`--${t.name}: ${value}`)
    }
  })
})

describe("the phone app routes", () => {
  const work = mkdtempSync(join(tmpdir(), "phone-"))
  const server = createIngestServer({ storageDir: work })
  let base = ""
  beforeAll(async () => {
    await new Promise<void>((ok) => server.listen(0, ok))
    base = `http://localhost:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => {
    server.close()
    rmSync(work, { recursive: true, force: true })
  })

  it("serves the app at / and the old adjust page at /adjust", async () => {
    const app = await (await fetch(`${base}/`)).text()
    expect(app).toContain('src="/phone.js"')
    expect(app).toContain("manifest.webmanifest")
    expect(await (await fetch(`${base}/adjust`)).text()).toContain('src="/app.js"')
  })
  it("serves the script, theme, manifest, icons and fonts", async () => {
    const js = await fetch(`${base}/phone.js`)
    expect(js.headers.get("content-type")).toMatch(/javascript/)
    expect(await js.text()).toContain("Pair your Specs")
    expect((await fetch(`${base}/theme.css`)).headers.get("content-type")).toMatch(/text\/css/)
    const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json()
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/" })
    for (const icon of manifest.icons) expect((await fetch(`${base}${icon.src}`)).headers.get("content-type")).toBe("image/png")
    expect((await fetch(`${base}/icons/apple-touch-icon.png`)).status).toBe(200)
    const font = await fetch(`${base}/fonts/Sora-800.woff2`)
    expect(font.headers.get("content-type")).toBe("font/woff2")
    expect((await fetch(`${base}/fonts/..%2Fsecret.woff2`)).status).not.toBe(200)
    expect((await fetch(`${base}/fonts/Sora-999.woff2`)).status).toBe(404)
  })
})
