/** Typing the code from the Specs: validation and the call to the server. */

export const NETWORK_ERROR = "Can't reach Dance Coach. Check that your phone is on the same Wi-Fi as your computer."
export const SHORT_CODE_MESSAGE = "Type the 4 digits shown on your Specs."

/** Keeps only digits, at most four. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4)
}

export type PairResult = { ok: true; token: string } | { ok: false; error: string }

export async function pair(code: string, fetchFn: typeof fetch = fetch): Promise<PairResult> {
  if (code.length !== 4) return { ok: false, error: SHORT_CODE_MESSAGE }
  let res: Response
  try {
    res = await fetchFn("/link/pair", { method: "POST", body: JSON.stringify({ code }) })
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok && typeof body.phoneToken === "string") return { ok: true, token: body.phoneToken }
  return { ok: false, error: typeof body.error === "string" ? body.error : NETWORK_ERROR }
}
