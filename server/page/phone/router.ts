/** The phone app's hash router, and its guard. Pure: main.ts reads and writes the real location. */

export type RouteName = "home" | "pair" | "kit"

const ROUTES: Record<string, RouteName> = { "/": "home", "/pair": "pair", "/kit": "kit" }
/** Reachable without a token: the pair screen itself, and the kit page used to check components against the renders. */
const OPEN: RouteName[] = ["pair", "kit"]
const HASH: Record<RouteName, string> = { home: "#/", pair: "#/pair", kit: "#/kit" }

/** "#/pair?x=1" -> "pair". Anything unknown is home. */
export function parseRoute(hash: string): RouteName {
  const path = hash.replace(/^#/, "").split("?")[0] || "/"
  return ROUTES[path] ?? "home"
}

/** Where the app should really be: no token sends everything but the open routes to pair; a token has no use for pair. */
export function resolveRoute(hash: string, hasToken: boolean): { route: RouteName; hash: string } {
  let route = parseRoute(hash)
  if (!hasToken && !OPEN.includes(route)) route = "pair"
  else if (hasToken && route === "pair") route = "home"
  return { route, hash: HASH[route] }
}
