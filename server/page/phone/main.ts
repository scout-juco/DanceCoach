/** The phone app's entry: token, link poller, hash router. Served at / as phone.js. */
import { LinkPoller, TOKEN_KEY, type PollerDeps } from "./linkState"
import { resolveRoute } from "./router"
import { addScreen, processingScreen } from "./addScreen"
import { linkFromShare } from "./add"
import { comingScreen, libraryScreen } from "./libraryScreen"
import { trimScreen } from "./trimScreen"
import { kitScreen, pairScreen, showNotConnected, type Ctx, type Screen } from "./screens"

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
  getToken: readToken,
  setToken: writeToken,
  go: (hash) => {
    location.hash = hash
    render()
  },
}

const app = document.getElementById("app")!
let current: Screen | null = null

// Android's share sheet opens the app at /?url=...&text=...; the link waits here until the Add screen takes it.
let sharedLink = linkFromShare(location.search)
if (sharedLink) history.replaceState(null, "", "/#/add")

function render() {
  let { route, hash, id } = resolveRoute(location.hash, readToken() !== null)
  // Shared before pairing: once paired the app lands on home, and the link goes on from there.
  if (sharedLink && route === "home") ({ route, hash } = resolveRoute("#/add", true))
  if (location.hash !== hash) history.replaceState(null, "", hash)
  current?.dispose()
  // P4 and P5 are other tickets: stand-ins until they land.
  const takeShared = () => {
    const link = sharedLink
    sharedLink = undefined
    return link
  }
  const screens = { pair: () => pairScreen(ctx), kit: () => kitScreen(ctx), add: () => addScreen(ctx, takeShared()), trim: () => trimScreen(ctx, id!), processing: () => processingScreen(ctx, id!), dance: () => comingScreen(ctx, "Ready to learn"), practice: () => comingScreen(ctx, "While you practice"), home: () => libraryScreen(ctx) }
  current = screens[route]()
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
  else if (was === "connected" && s.status === "not-connected" && ["home", "practice"].includes(resolveRoute(location.hash, true).route)) showNotConnected(ctx)
})

window.addEventListener("hashchange", render)
document.addEventListener("visibilitychange", () => link.wake())
render()
link.start()
