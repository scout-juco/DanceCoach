/** The phone's commands to the Specs, sent through the server's link. */
import { NETWORK_ERROR } from "./pairing"

export type PracticeResult = { ok: true } | { ok: false; error: string }

async function send(token: string, command: object, fetchFn: typeof fetch): Promise<PracticeResult> {
  let res: Response
  try {
    res = await fetchFn("/link/phone/command", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(command) })
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({}))
  return { ok: false, error: typeof body.error === "string" ? body.error : NETWORK_ERROR }
}

/** Asks the Specs to open a dance at a section. */
export function openDanceOnSpecs(token: string, danceId: string, section: number, fetchFn: typeof fetch = fetch): Promise<PracticeResult> {
  return send(token, { type: "open-dance", danceId, section }, fetchFn)
}

/** Asks the Specs to leave the dance and go back to Pick a dance. */
export function endSessionOnSpecs(token: string, fetchFn: typeof fetch = fetch): Promise<PracticeResult> {
  return send(token, { type: "end-session" }, fetchFn)
}
