/** The phone's commands to the Specs, sent through the server's link. */
import { NETWORK_ERROR } from "./pairing"

export type PracticeResult = { ok: true } | { ok: false; error: string }

/** Asks the Specs to open a dance at a section. */
export async function openDanceOnSpecs(token: string, danceId: string, section: number, fetchFn: typeof fetch = fetch): Promise<PracticeResult> {
  let res: Response
  try {
    res = await fetchFn("/link/phone/command", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "open-dance", danceId, section }),
    })
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({}))
  return { ok: false, error: typeof body.error === "string" ? body.error : NETWORK_ERROR }
}
