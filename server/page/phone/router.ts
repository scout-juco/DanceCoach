/** The phone app's hash router, and its guard. Pure: main.ts reads and writes the real location. */

export type RouteName = "home" | "pair" | "kit" | "add" | "practice" | "dance" | "trim" | "processing"

const ROUTES: Record<string, RouteName> = { "/": "home", "/pair": "pair", "/kit": "kit", "/add": "add", "/practice": "practice" }
/** Reachable without a token: the pair screen itself, and the kit page used to check components against the renders. */
const OPEN: RouteName[] = ["pair", "kit"]
const HASH: Record<RouteName, string> = { home: "#/", pair: "#/pair", kit: "#/kit", add: "#/add", practice: "#/practice", dance: "#/dance", trim: "#/trim", processing: "#/processing" }
/** The routes about one dance: P4, P3 and the processing screen. */
const ID_ROUTES = ["dance", "trim", "processing"] as const

const pathOf = (hash: string) => hash.replace(/^#/, "").split("?")[0] || "/"
/** "#/dance/ab12" -> { route: "dance", id: "ab12" }. */
const idRouteOf = (hash: string) => {
  const m = /^\/(dance|trim|processing)\/([^/]+)$/.exec(pathOf(hash))
  return m ? { route: m[1] as (typeof ID_ROUTES)[number], id: m[2] } : undefined
}

/** "#/pair?x=1" -> "pair". Anything unknown is home. */
export function parseRoute(hash: string): RouteName {
  return idRouteOf(hash)?.route ?? ROUTES[pathOf(hash)] ?? "home"
}

/** Where the app should really be: no token sends everything but the open routes to pair; a token has no use for pair. A route about a dance keeps its id. */
export function resolveRoute(hash: string, hasToken: boolean): { route: RouteName; hash: string; id?: string } {
  let route = parseRoute(hash)
  if (!hasToken && !OPEN.includes(route)) route = "pair"
  else if (hasToken && route === "pair") route = "home"
  const withId = idRouteOf(hash)
  if (withId && withId.route === route) return { route, hash: `${HASH[route]}/${withId.id}`, id: withId.id }
  return { route, hash: HASH[route] }
}
