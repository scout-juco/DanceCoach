/**
 * The ingest server: upload a video, adjust its draft package, save it, and serve what is ready.
 *
 *   POST /dances              body = the video file (raw bytes), ?name=<original file name>
 *     201 { package, confidence }   the draft: detected bpm and first beat, whole video as the trim
 *   PUT /dances/<id>          body = the adjusted package (JSON); validates, cuts the clips, marks it ready
 *     200 { package }               the package as stored (its video name is always the server's)
 *   GET /dances               the ready dances: [{ id, title, difficulty }]
 *   GET /dances/<id>/package  a ready dance's package
 *   GET /dances/<id>/clips/<name>  one of its clips, named <video>_<clip id>.mp4
 *   GET /dances/<id>/original the uploaded video (supports Range, so the adjust page can seek)
 *   GET /                     the adjust page; GET /app.js is its script, bundled from server/page
 *     4xx { error }                 a readable reason
 *
 * The original is kept at <storage>/<id>/original<ext>. Detection is only a starting guess.
 * A dance is ready once <storage>/<id>/package.json exists; it is written only after every
 * clip is cut (into <id>/clips), so a failed save never leaves a half-ready dance.
 */
import { randomBytes } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { build } from "esbuild"
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { pipeline } from "node:stream/promises"
import { DancePackage, loadDancePackage } from "../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { cutClips } from "../scripts/cutClips"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { detectBeats } from "./detectBeats"
import { decodeAudio, probeVideo, UploadError } from "./media"

const MAX_UPLOAD_BYTES = 1024 ** 3
const MAX_PACKAGE_BYTES = 1024 ** 2
const ID_PATTERN = /^[0-9a-f]{12}$/

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

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_PACKAGE_BYTES) throw new UploadError("That dance package is too big.")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

const exists = (path: string) => stat(path).then(() => true, () => false)

/** The uploaded original's path, or null if there is no such draft. */
async function findOriginal(storageDir: string, id: string): Promise<string | null> {
  if (!ID_PATTERN.test(id)) return null
  const files = await readdir(join(storageDir, id)).catch(() => [] as string[])
  const original = files.find((f) => f.startsWith("original."))
  return original ? join(storageDir, id, original) : null
}

/** Validates the adjusted package, cuts its clips and marks the dance ready. */
async function saveDance(id: string, body: string, storageDir: string): Promise<DancePackage> {
  const original = await findOriginal(storageDir, id)
  if (!original) throw new NotFoundError("There's no dance to save. Upload the video again.")
  let raw: any
  try {
    raw = JSON.parse(body)
  } catch {
    throw new UploadError("That dance package isn't valid JSON.")
  }
  // The video name is the server's: it is what keeps clip names unique per dance.
  let pkg: DancePackage
  try {
    pkg = loadDancePackage({ ...raw, id, video: `${id}${extname(original)}` })
  } catch (err) {
    throw new UploadError((err as Error).message)
  }
  const dir = join(storageDir, id)
  const staging = join(dir, "clips.tmp")
  await rm(staging, { recursive: true, force: true })
  try {
    cutClips(pkg, original, staging)
  } catch (err) {
    await rm(staging, { recursive: true, force: true })
    throw err
  }
  await rm(join(dir, "clips"), { recursive: true, force: true })
  await rename(staging, join(dir, "clips"))
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg, null, 2))
  return pkg
}

async function readReady(storageDir: string, id: string): Promise<DancePackage | null> {
  if (!ID_PATTERN.test(id)) return null
  try {
    return loadDancePackage(JSON.parse(await readFile(join(storageDir, id, "package.json"), "utf8")))
  } catch {
    return null
  }
}

async function listReady(storageDir: string) {
  const ids = await readdir(storageDir).catch(() => [] as string[])
  const ready = await Promise.all(ids.map((id) => readReady(storageDir, id)))
  return ready.flatMap((p) => (p ? [{ id: p.id, title: p.title, difficulty: p.difficulty }] : []))
}

class NotFoundError extends Error {}

const pageDir = fileURLToPath(new URL("./page/", import.meta.url))
const VIDEO_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4" }

let bundle: Promise<string> | undefined
/** The adjust page's script: server/page/adjust.ts with the lens's count logic, bundled once. */
function pageScript(): Promise<string> {
  bundle ??= build({ entryPoints: [join(pageDir, "adjust.ts")], bundle: true, write: false, format: "esm", target: "es2020" })
    .then((r) => r.outputFiles[0].text)
    .catch((err) => {
      bundle = undefined
      throw err
    })
  return bundle
}

/** Streams a file, honouring a single Range so the browser can seek. */
async function sendFile(req: IncomingMessage, res: ServerResponse, file: string, type: string) {
  const size = (await stat(file)).size
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "")
  let start = 0
  let end = size - 1
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(size - Number(m[2]), 0)
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` })
      return void res.end()
    }
    res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 })
  } else {
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": size })
  }
  createReadStream(file, { start, end }).pipe(res)
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
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        return void res.end(await readFile(join(pageDir, "adjust.html")))
      }
      if (req.method === "GET" && url.pathname === "/app.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" })
        return void res.end(await pageScript())
      }
      if (req.method === "GET" && url.pathname === "/dances") {
        return send(res, 200, await listReady(options.storageDir))
      }
      const route = url.pathname.match(/^\/dances\/([^/]+)(?:\/(package|original|clips\/([^/]+)))?$/)
      if (route) {
        const [, id, what, clipFile] = route
        if (req.method === "PUT" && !what) {
          const pkg = await saveDance(id, await readBody(req), options.storageDir)
          return send(res, 200, { package: pkg })
        }
        if (req.method === "GET" && what === "original") {
          const original = await findOriginal(options.storageDir, id)
          if (original) return await sendFile(req, res, original, VIDEO_TYPES[extname(original)] ?? "application/octet-stream")
        } else if (req.method === "GET" && what) {
          const pkg = await readReady(options.storageDir, id)
          if (pkg && what === "package") return send(res, 200, pkg)
          if (pkg && clipFile) {
            const names = planClips(pkg).map((c) => `${clipAssetName(pkg.video, c.id)}.mp4`)
            const file = join(options.storageDir, id, "clips", clipFile)
            if (names.includes(clipFile) && (await exists(file))) {
              res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": (await stat(file)).size })
              return void createReadStream(file).pipe(res)
            }
          }
        }
      }
      send(res, 404, { error: "Not found." })
    } catch (err) {
      if (err instanceof NotFoundError) return send(res, 404, { error: err.message })
      if (err instanceof UploadError) return send(res, 422, { error: err.message })
      console.error(err)
      send(res, 500, { error: "Something went wrong on the server." })
    }
  })
}
