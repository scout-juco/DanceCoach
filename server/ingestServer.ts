/**
 * The ingest server. Today: upload a video, get a draft dance package back.
 *
 *   POST /dances   body = the video file (raw bytes), ?name=<original file name>
 *     201 { package, confidence }   the draft: detected bpm and first beat, whole video as the trim
 *     4xx { error }                 a readable reason
 *
 * The original is kept at <storage>/<id>/original<ext>. Detection is only a starting guess.
 */
import { randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http"
import { extname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { DancePackage, loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { detectBeats } from "./detectBeats"
import { decodeAudio, probeVideo, UploadError } from "./media"

const MAX_UPLOAD_BYTES = 1024 ** 3

export interface IngestOptions {
  /** Where each dance's folder goes. */
  storageDir: string
}

export interface Draft {
  package: DancePackage
  /** How sure detection is, 0–1. */
  confidence: number
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

/** Stores an upload under a new dance id and builds its draft package. */
async function createDraft(req: IncomingMessage, name: string, storageDir: string): Promise<Draft> {
  const id = randomBytes(6).toString("hex")
  const dir = join(storageDir, id)
  const ext = extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".mp4"
  const original = join(dir, `original${ext}`)
  await mkdir(dir, { recursive: true })
  try {
    await pipeline(req, createWriteStream(original))
    const info = await probeVideo(original)
    if (!info.hasAudio) throw new UploadError("That video has no sound, so we can't find the beat. Try one with the music in it.")
    const guess = detectBeats(await decodeAudio(original))
    const pkg = loadDancePackage({
      id,
      title: name.replace(/\.[^.]+$/, "") || "Untitled dance",
      difficulty: "Beginner",
      // Unique per dance, so clips from many dances sit side by side.
      video: `${id}${ext}`,
      trim: { start: 0, end: info.durationSec },
      bpm: guess.bpm,
      firstBeatSec: guess.firstBeatSec,
      source: "upload",
    })
    return { package: pkg, confidence: guess.confidence }
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    throw err
  }
}

export function createIngestServer(options: IngestOptions): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    try {
      if (req.method === "POST" && url.pathname === "/dances") {
        if (Number(req.headers["content-length"] ?? 0) > MAX_UPLOAD_BYTES) {
          return send(res, 413, { error: "That video is too big (1 GB at most)." })
        }
        const draft = await createDraft(req, url.searchParams.get("name") ?? "dance.mp4", options.storageDir)
        return send(res, 201, draft)
      }
      send(res, 404, { error: "Not found." })
    } catch (err) {
      if (err instanceof UploadError) return send(res, 422, { error: err.message })
      console.error(err)
      send(res, 500, { error: "Something went wrong on the server." })
    }
  })
}
