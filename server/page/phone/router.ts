/** The phone app's hash router, and its guard. Pure: main.ts reads and writes the real location. */

export type RouteName = "home" | "pair" | "kit" | "add" | "practice" | "dance"

const ROUTES: Record<string, RouteName> = { "/": "home", "/pair": "pair", "/kit": "kit", "/add": "add", "/practice": "practice" }
/** Reachable without a token: the pair screen itself, and the kit page used to check components against the renders. */
const OPEN: RouteName[] = ["pair", "kit"]
const HASH: Record<RouteName, string> = { home: "#/", pair: "#/pair", kit: "#/kit", add: "#/add", practice: "#/practice", dance: "#/dance" }

const pathOf = (hash: string) => hash.replace(/^#/, "").split("?")[0] || "/"
/** "#/dance/ab12" -> "ab12". */
const danceIdOf = (hash: string) => /^\/dance\/([^/]+)$/.exec(pathOf(hash))?.[1]

/** "#/pair?x=1" -> "pair". Anything unknown is home. */
export function parseRoute(hash: string): RouteName {
  return danceIdOf(hash) ? "dance" : ROUTES[pathOf(hash)] ?? "home"
}

/** Where the app should really be: no token sends everything but the open routes to pair; a token has no use for pair. A dance route keeps its id. */
export function resolveRoute(hash: string, hasToken: boolean): { route: RouteName; hash: string; id?: string } {
  let route = parseRoute(hash)
  if (!hasToken && !OPEN.includes(route)) route = "pair"
  else if (hasToken && route === "pair") route = "home"
  if (route === "dance") {
    const id = danceIdOf(hash)!
    return { route, hash: `${HASH.dance}/${id}`, id }
  }
  return { route, hash: HASH[route] }
}
