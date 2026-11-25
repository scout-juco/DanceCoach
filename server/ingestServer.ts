/**
 * The ingest server: upload a video, adjust its draft package, save it, and serve what is ready.
 *
 *   POST /dances              body = the video file (raw bytes), ?name=<original file name>
 *     201 { package, confidence }   the draft: detected bpm and first beat, whole video as the trim
 *   PUT /dances/<id>          body = the adjusted package (JSON); validates, cuts the clips, marks it ready
 *     200 { package }               the package as stored (its video name is always the server's)
 *   POST /dances/link         body = { url } (JSON): fetches the video with yt-dlp, then as an upload
 *     201 { package, confidence }   the same draft; its source is the link
 *   DELETE /dances/<id>       removes the dance and its files (200 { deleted: true })
 *   GET /dances               the ready dances: [{ id, title, difficulty, sections, lengthSec, thumbnail }]
 *   GET /dances/<id>/package  a ready dance's package
 *   GET /dances/<id>/clips/<name>  one of its clips, named <video>_<clip id>.mp4
 *   GET /dances/<id>/stills/<name> one of its stills (a JPEG per half-count), as listed in the package's stills
 *   GET /dances/<id>/original the uploaded video (supports Range, so the adjust page can seek)
 *   POST /dances/<id>/takes/session   body = { section, speed, mirror }: arms a take (replacing any session) -> 201 the session
 *   POST /takes/session/<sid>/start | /stop   sent by the glasses
 *   POST /takes/session/<sid>/upload          body = the phone's recording; lines it up, trims and transcodes it -> the session
 *   GET /recorder/state       alias of GET /link/phone/beat without a token: { session } while armed or recording; counts as the phone's heartbeat
 *   GET /recorder/status      for the glasses: { phoneConnected, session } (armed, recording, uploading, processing, ready, failed)
 *   POST /link/specs/beat     body = { specsId, state, repair? }: the Specs' beat -> { pairCode?, paired, phoneConnected, commands }
 *                             body { ack: <commandId> } also clears that command
 *   POST /link/pair           body = { code } -> { phoneToken }, or 422 with a readable error
 *   GET /link/phone/beat      Bearer token: { specs: connected | not-connected | unpaired, state?, session, serverTime }
 *   POST /link/phone/command  Bearer token, body = { type: "open-dance", danceId, section? } | { type: "end-session" } -> 201 the command
 *   Once a phone is paired, DELETE/PUT /dances/<id> and DELETE /dances/<id>/takes/<name> need its token (401 without).
 *   GET /dances/<id>/takes?section=n          the takes (all, or one section's): [{ name, section, speed, mirror, created, offset, number }]
 *   GET /dances/<id>/takes/<name>.mp4         one take;  DELETE /dances/<id>/takes/<name> removes it
 *   GET /                     the adjust page; GET /app.js is its script, bundled from server/page
 *   GET /record               the phone recorder page; GET /record.js is its script
 *     4xx { error }                 a readable reason
 *
 * The original is kept at <storage>/<id>/original<ext>. Detection is only a starting guess.
 * A dance is ready once <storage>/<id>/package.json exists; it is written only after every
 * clip and still is cut (into <id>/clips and <id>/stills), so a failed save never leaves a half-ready dance.
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
import { cutStills } from "../scripts/cutStills"
import { listingOf } from "../DanceCoachLens/Assets/Scripts/Core/DanceCards"
import { clipAssetName, planClips } from "../DanceCoachLens/Assets/Scripts/Core/ClipPlan"
import { stillNames } from "../DanceCoachLens/Assets/Scripts/Core/StillPlan"
import { detectBeats } from "./detectBeats"
import { decodeAudio, fetchWithYtDlp, probeVideo, UploadError, VideoFetcher } from "./media"
import { AuthError, cleanState, Link, LinkError } from "./link"
import { deleteTake, NotFoundError, rawUploadPath, readTakes, Recorder, takeFile } from "./takes"

const MAX_UPLOAD_BYTES = 1024 ** 3
const MAX_PACKAGE_BYTES = 1024 ** 2
const MAX_TAKE_BYTES = 512 * 1024 ** 2
const ID_PATTERN = /^[0-9a-f]{12}$/

export interface IngestOptions {
  /** Where each dance's folder goes. */
  storageDir: string
  /** Gets the video behind a link into a folder. Defaults to yt-dlp; tests fake it. */
  fetchVideo?: VideoFetcher
  /** The clock for takes (phone heartbeat, upload timeout). Tests fake it. */
  now?: () => number
  /** How long after stop the phone has to upload a take. */
  uploadTimeoutMs?: number
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

/** Makes a dance folder, fills it with `store`, and builds its draft package. Keeps nothing on failure. */
async function createDraft(
  storageDir: string,
  source: string,
  store: (dir: string) => Promise<{ original: string; title: string }>,
): Promise<Draft> {
  const id = randomBytes(6).toString("hex")
  const dir = join(storageDir, id)
  await mkdir(dir, { recursive: true })
  try {
    const { original, title } = await store(dir)
    const info = await probeVideo(original)
    if (!info.hasAudio) throw new UploadError("That video has no sound, so we can't find the beat. Try one with the music in it.")
    const guess = detectBeats(await decodeAudio(original))
    const pkg = loadDancePackage({
      id,
      title: title || "Untitled dance",
      difficulty: "Beginner",
      // Unique per dance, so clips from many dances sit side by side.
      video: `${id}${extname(original)}`,
      trim: { start: 0, end: info.durationSec },
      bpm: guess.bpm,
      firstBeatSec: guess.firstBeatSec,
      source,
    })
    return { package: pkg, confidence: guess.confidence }
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    throw err
  }
}

/** Stores an upload under a new dance id and builds its draft package. */
function draftFromUpload(req: IncomingMessage, name: string, storageDir: string): Promise<Draft> {
  return createDraft(storageDir, "upload", async (dir) => {
    const ext = extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".mp4"
    const original = join(dir, `original${ext}`)
    await pipeline(req, createWriteStream(original))
    return { original, title: name.replace(/\.[^.]+$/, "") }
  })
}

/** Fetches the video behind a link and builds its draft package; the link is the package's source. */
async function draftFromLink(body: string, options: IngestOptions): Promise<Draft> {
  let link: URL
  try {
    link = new URL(String(JSON.parse(body).url).trim())
    if (link.protocol !== "http:" && link.protocol !== "https:") throw new Error()
  } catch {
    throw new UploadError("That doesn't look like a link. Paste the address of the video, or upload the file instead.")
  }
  const fetchVideo = options.fetchVideo ?? fetchWithYtDlp
  return createDraft(options.storageDir, link.href, async (dir) => {
    try {
      return await fetchVideo(link.href, dir)
    } catch (err) {
      if (err instanceof UploadError) throw err
      throw new UploadError("We couldn't get a video from that link. It may be private or from a site we can't read. Try uploading the file instead.")
    }
  })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const body = JSON.parse((await readBody(req)) || "{}")
    if (body && typeof body === "object") return body
  } catch {}
  throw new LinkError("That isn't valid JSON.")
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

/**
 * Bump when the ffmpeg settings for clips or stills change: dances cut with an older version are cut again
 * the next time they're made ready. Each cut folder holds a CUT_MARKER file saying which version cut it.
 */
const CUT_VERSION = "2"
const CUT_MARKER = ".cut-version"

async function cutIsCurrent(folder: string): Promise<boolean> {
  try {
    return (await readFile(join(folder, CUT_MARKER), "utf8")).trim() === CUT_VERSION
  } catch {
    return false
  }
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
  pkg = { ...pkg, stills: stillNames(pkg) }
  const dir = join(storageDir, id)
  // Editing a ready dance's name or difficulty keeps its timing, so its clips and stills are still right.
  const before = await readReady(storageDir, id)
  const timing = (p: DancePackage) => JSON.stringify([p.video, p.trim, p.bpm, p.firstBeatSec, p.sections])
  const same = before !== null && timing(before) === timing(pkg)
  // A dance made ready before Pose has clips but no stills; saving it again adds them.
  const cut = [
    { name: "clips", run: cutClips, needed: !(same && (await cutIsCurrent(join(dir, "clips")))) },
    { name: "stills", run: cutStills, needed: !(same && (await cutIsCurrent(join(dir, "stills")))) },
  ].filter((c) => c.needed)
  const stagingOf = (name: string) => join(dir, `${name}.tmp`)
  const clearStaging = () => Promise.all(cut.map((c) => rm(stagingOf(c.name), { recursive: true, force: true })))
  await clearStaging()
  try {
    for (const c of cut) {
      c.run(pkg, original, stagingOf(c.name))
      await writeFile(join(stagingOf(c.name), CUT_MARKER), CUT_VERSION)
    }
  } catch (err) {
    await clearStaging()
    throw err
  }
  // The old files and package keep being served while the new ones are cut; the swap is the last, quick step.
  await writeFile(join(dir, "package.json.tmp"), JSON.stringify(pkg, null, 2))
  for (const c of cut) {
    await rm(join(dir, c.name), { recursive: true, force: true })
    await rename(stagingOf(c.name), join(dir, c.name))
  }
  await rename(join(dir, "package.json.tmp"), join(dir, "package.json"))
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
  return ready.flatMap((p) => (p ? [listingOf(p)] : []))
}

const pageDir = fileURLToPath(new URL("./page/", import.meta.url))
const VIDEO_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4" }

const bundles = new Map<string, Promise<string>>()
/** A page's script: server/page/<entry>.ts with whatever it imports (the adjust page, the lens's count logic), bundled once. */
function pageScript(entry: "adjust" | "record"): Promise<string> {
  let bundle = bundles.get(entry)
  if (!bundle) {
    bundle = build({ entryPoints: [join(pageDir, `${entry}.ts`)], bundle: true, write: false, format: "esm", target: "es2020" })
      .then((r) => r.outputFiles[0].text)
      .catch((err) => {
        bundles.delete(entry)
        throw err
      })
    bundles.set(entry, bundle)
  }
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
  const recorder = new Recorder(options)
  const link = new Link({ now: options.now })
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1]
    try {
      const phoneWrite = (req.method === "PUT" || req.method === "DELETE") && /^\/dances\/[^/]+(\/takes\/[^/]+)?$/.test(url.pathname)
      if (phoneWrite && !link.mayWrite(bearer)) throw new AuthError("Pair your phone with your Specs first.")
      if (req.method === "GET" && url.pathname === "/recorder/state") {
        link.phoneSeen()
        return send(res, 200, recorder.phoneState())
      }
      if (req.method === "GET" && url.pathname === "/recorder/status") return send(res, 200, { ...recorder.status(), phoneConnected: link.phoneConnected() })
      if (req.method === "POST" && url.pathname === "/link/specs/beat") {
        const body = await readJson(req)
        if (typeof body.specsId !== "string" || !body.specsId) throw new LinkError("Say which Specs you are.")
        if (typeof body.ack === "string") link.ack(body.specsId, body.ack)
        return send(res, 200, link.specsBeat(body.specsId, cleanState(body.state), body.repair === true))
      }
      if (req.method === "POST" && url.pathname === "/link/pair") return send(res, 200, link.pair((await readJson(req)).code))
      if (req.method === "GET" && url.pathname === "/link/phone/beat") {
        const beat = link.phoneBeat(bearer)
        return send(res, 200, beat.specs === "unpaired" ? beat : { ...beat, ...recorder.phoneState() })
      }
      if (req.method === "POST" && url.pathname === "/link/phone/command") return send(res, 201, link.command(bearer, await readJson(req)))
      const sessionRoute = url.pathname.match(/^\/takes\/session\/([^/]+)\/(start|stop|upload)$/)
      if (req.method === "POST" && sessionRoute) {
        const [, sid, action] = sessionRoute
        if (action === "start") {
          let videoTime: unknown
          try {
            videoTime = JSON.parse((await readBody(req)) || "{}").videoTimeSec
          } catch {}
          return send(res, 200, { ...recorder.start(sid, typeof videoTime === "number" ? videoTime : undefined), serverTime: recorder.time() })
        }
        if (action === "stop") {
          let startedAt: unknown
          try {
            startedAt = JSON.parse((await readBody(req)) || "{}").startedAtServer
          } catch {}
          return send(res, 200, recorder.stop(sid, typeof startedAt === "number" ? startedAt : undefined))
        }
        const waiting = recorder.beginUpload(sid)
        const pkg = await readReady(options.storageDir, waiting.danceId)
        if (!pkg) return send(res, 404, { error: "That dance is gone." })
        const raw = await rawUploadPath(options.storageDir, waiting.danceId, sid, req.headers["content-type"] ?? "")
        if (Number(req.headers["content-length"] ?? 0) > MAX_TAKE_BYTES) {
          recorder.fail(sid, "That recording is too big.")
          return send(res, 413, { error: "That recording is too big." })
        }
        try {
          await pipeline(req, createWriteStream(raw))
        } catch {
          return send(res, 422, { error: recorder.fail(sid, "The recording didn't arrive in full. Record again.").reason })
        }
        const startedHeader = Number(req.headers["x-recording-started"])
        const done = await recorder.finishUpload(sid, raw, pkg, Number.isFinite(startedHeader) ? startedHeader : undefined)
        return done.state === "ready" ? send(res, 200, done) : send(res, 422, { error: done.reason, session: done })
      }
      const takesRoute = url.pathname.match(/^\/dances\/([^/]+)\/takes(?:\/([^/]+))?$/)
      if (takesRoute) {
        const [, id, what] = takesRoute
        if (!(await readReady(options.storageDir, id))) throw new NotFoundError("There's no such dance.")
        if (req.method === "POST" && what === "session") {
          let params: any
          try {
            params = JSON.parse(await readBody(req))
          } catch {
            throw new UploadError("That isn't valid JSON.")
          }
          return send(res, 201, recorder.arm((await readReady(options.storageDir, id))!, params ?? {}))
        }
        if (req.method === "GET" && !what) {
          const section = url.searchParams.get("section")
          return send(res, 200, (await readTakes(options.storageDir, id)).filter((t) => section === null || t.section === Number(section)))
        }
        if (req.method === "GET" && what?.endsWith(".mp4")) {
          const file = await takeFile(options.storageDir, id, what.slice(0, -4))
          if (file) {
            res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": (await stat(file)).size })
            return void createReadStream(file).pipe(res)
          }
          throw new NotFoundError("There's no such take.")
        }
        if (req.method === "DELETE" && what) {
          await deleteTake(options.storageDir, id, what)
          return send(res, 200, { deleted: true })
        }
      }
      if (req.method === "POST" && url.pathname === "/dances") {
        if (Number(req.headers["content-length"] ?? 0) > MAX_UPLOAD_BYTES) {
          return send(res, 413, { error: "That video is too big (1 GB at most)." })
        }
        const draft = await draftFromUpload(req, url.searchParams.get("name") ?? "dance.mp4", options.storageDir)
        return send(res, 201, draft)
      }
      if (req.method === "POST" && url.pathname === "/dances/link") {
        return send(res, 201, await draftFromLink(await readBody(req), options))
      }
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        return void res.end(await readFile(join(pageDir, "adjust.html")))
      }
      if (req.method === "GET" && url.pathname === "/app.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" })
        return void res.end(await pageScript("adjust"))
      }
      if (req.method === "GET" && url.pathname === "/record") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        return void res.end(await readFile(join(pageDir, "record.html")))
      }
      if (req.method === "GET" && url.pathname === "/record.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" })
        return void res.end(await pageScript("record"))
      }
      if (req.method === "GET" && url.pathname === "/dances") {
        return send(res, 200, await listReady(options.storageDir))
      }
      const route = url.pathname.match(/^\/dances\/([^/]+)(?:\/(package|original|clips\/([^/]+)|stills\/([^/]+)))?$/)
      if (route) {
        const [, id, what, clipFile, stillFile] = route
        if (req.method === "PUT" && !what) {
          const pkg = await saveDance(id, await readBody(req), options.storageDir)
          return send(res, 200, { package: pkg })
        }
        if (req.method === "DELETE" && !what) {
          if (!ID_PATTERN.test(id) || !(await exists(join(options.storageDir, id)))) throw new NotFoundError("There's no such dance.")
          await rm(join(options.storageDir, id), { recursive: true, force: true })
          return send(res, 200, { deleted: true })
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
          if (pkg && stillFile && (pkg.stills ?? []).some((names) => names.includes(stillFile))) {
            const file = join(options.storageDir, id, "stills", stillFile)
            if (await exists(file)) {
              res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": (await stat(file)).size })
              return void createReadStream(file).pipe(res)
            }
          }
        }
      }
      send(res, 404, { error: "Not found." })
    } catch (err) {
      if (err instanceof NotFoundError) return send(res, 404, { error: err.message })
      if (err instanceof AuthError) return send(res, 401, { error: err.message })
      if (err instanceof LinkError) return send(res, 422, { error: err.message })
      if (err instanceof UploadError) return send(res, 422, { error: err.message })
      console.error(err)
      send(res, 500, { error: "Something went wrong on the server." })
    }
  })
}
