/** P2, Add a dance: the rules and the calls. Pure or fetch-injected, so Vitest can check them. */
import { levelOf } from "../../../DanceCoachLens/Assets/Scripts/Core/DanceCards"
import type { DanceStatus } from "../../ingestServer"
import { NETWORK_ERROR } from "./pairing"
import type { LibraryDance } from "./library"

export const SHARE_HELP = "Or tap Share in TikTok, Reels or Shorts and pick Dance Coach."
export const EMPTY_LINK_TEXT = "Paste the address of the video first."
export const GETTING_VIDEO = "Getting your video…"
export const UPLOADING_VIDEO = "Uploading your video…"

const LEVEL_NAMES = ["", "Easy", "Medium", "Hard"]

/** "●●○" for a trending tile; an unknown difficulty counts as the first level. */
export function difficultyDots(difficulty?: string): string {
  const level = Math.min(Math.max(levelOf(difficulty ?? ""), 1), 3)
  return "●".repeat(level) + "○".repeat(3 - level)
}

/** "Easy · 30s". */
export function tileMeta(d: Pick<LibraryDance, "difficulty"> & { lengthSec?: number }): string {
  const parts: string[] = []
  const level = d.difficulty ? levelOf(d.difficulty) : 0
  if (d.difficulty) parts.push(LEVEL_NAMES[level] || d.difficulty)
  if (d.lengthSec) parts.push(`${Math.round(d.lengthSec)}s`)
  return parts.join(" · ")
}

/** The video link in what an Android share sheet hands over (a TikTok share puts it in `text`, with words around it). */
export function linkFromShare(search: string): string | undefined {
  const params = new URLSearchParams(search)
  for (const key of ["url", "text", "title"]) {
    const found = /https?:\/\/[^\s]+/.exec(params.get(key) ?? "")?.[0]
    if (found) return found
  }
  return undefined
}

export type DraftResult = { ok: true; id: string } | { ok: false; error: string }

async function draftOf(call: () => Promise<Response>): Promise<DraftResult> {
  let res: Response
  try {
    res = await call()
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
  const body = await res.json().catch(() => ({}))
  const id = body?.package?.id
  if (res.ok && typeof id === "string") return { ok: true, id }
  return { ok: false, error: typeof body.error === "string" ? body.error : "Something went wrong. Try again." }
}

/** Sends a pasted link to the server, which fetches the video and makes the draft. */
export function addFromLink(link: string, fetchFn: typeof fetch = fetch): Promise<DraftResult> {
  return draftOf(() => fetchFn("/dances/link", { method: "POST", body: JSON.stringify({ url: link.trim() }) }))
}

/** Sends a video from the camera roll. */
export function addFromFile(file: File, fetchFn: typeof fetch = fetch): Promise<DraftResult> {
  return draftOf(() => fetchFn(`/dances?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file }))
}

export async function fetchTrending(fetchFn: typeof fetch = fetch): Promise<(LibraryDance & { lengthSec?: number })[]> {
  const res = await fetchFn("/trending", { cache: "no-store" })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export const SPLITTING_TEXT = "Splitting into sections…"
export const PROCESSING_FAILED = "We couldn't split that video. Go back and try again."
export const POLL_MS = 1000

/** What the processing screen does with a status: keep waiting (with how far along), finish, or give up. */
export type ProcessingStep = { next: "wait"; done: number; total: number } | { next: "ready" } | { next: "failed"; error: string }

export function processingStep(status: DanceStatus): ProcessingStep {
  if (status.status === "ready") return { next: "ready" }
  if (status.status === "failed") return { next: "failed", error: status.error || PROCESSING_FAILED }
  if (status.status === "processing") return { next: "wait", done: Math.min(status.done, status.total), total: Math.max(status.total, 1) }
  return { next: "wait", done: 0, total: 1 }
}

export async function fetchStatus(id: string, fetchFn: typeof fetch = fetch): Promise<DanceStatus | null> {
  try {
    const res = await fetchFn(`/dances/${encodeURIComponent(id)}`, { cache: "no-store" })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
