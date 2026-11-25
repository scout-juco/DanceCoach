/** The phone app's entry: token, link poller, hash router. Served at / as phone.js. */
import { LinkPoller, TOKEN_KEY, type PollerDeps } from "./linkState"
import { resolveRoute } from "./router"
import { homeScreen, kitScreen, pairScreen, showNotConnected, type Ctx, type Screen } from "./screens"

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: the app works until it is closed */
  }
}

const deps: PollerDeps = {
  getToken: readToken,
  setToken: writeToken,
  fetchJson: async (token) => {
    const res = await fetch("/link/phone/beat", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  },
  isVisible: () => document.visibilityState === "visible",
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id as number),
}

const link = new LinkPoller(deps)
const ctx: Ctx = {
  link,
  setToken: writeToken,
  go: (hash) => {
    location.hash = hash
    render()
  },
}

const app = document.getElementById("app")!
let current: Screen | null = null

function render() {
  const { route, hash } = resolveRoute(location.hash, readToken() !== null)
  if (location.hash !== hash) history.replaceState(null, "", hash)
  current?.dispose()
  current = route === "pair" ? pairScreen(ctx) : route === "kit" ? kitScreen(ctx) : homeScreen(ctx)
  app.replaceChildren(current.root)
  window.scrollTo(0, 0)
}

// A lost pairing (the server restarted) clears the token; the guard then sends the app to pair. The sheet
// opens when a connected Specs goes quiet, on the screens that show the link.
let last = link.snapshot.status
link.subscribe((s) => {
  const was = last
  last = s.status
  if (s.status === "unpaired" && was !== "unpaired" && resolveRoute(location.hash, readToken() !== null).route === "pair") render()
  else if (was === "connected" && s.status === "not-connected" && resolveRoute(location.hash, true).route === "home") showNotConnected(ctx)
})

window.addEventListener("hashchange", render)
document.addEventListener("visibilitychange", () => link.wake())
render()
link.start()
