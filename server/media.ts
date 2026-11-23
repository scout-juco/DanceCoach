/** ffmpeg and ffprobe on the PATH: what is in an uploaded file, and its audio decoded for beat detection. */
import { execFile } from "node:child_process"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { SAMPLE_RATE } from "./detectBeats"

const run = promisify(execFile)

/** Raised for a file the dancer can fix by trying another one; the message is safe to show. */
export class UploadError extends Error {}

export interface VideoInfo {
  durationSec: number
  hasAudio: boolean
}

/** Reads a file's streams. Throws UploadError if it isn't a video. */
export async function probeVideo(file: string): Promise<VideoInfo> {
  let streams: { codec_type: string }[]
  let duration: number
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file])
    const info = JSON.parse(stdout)
    streams = info.streams ?? []
    duration = Number(info.format?.duration)
  } catch (err) {
    console.error(`ffprobe failed on ${file}:`, err)
    throw new UploadError("That file isn't a video we can read. Try an MP4 or MOV.")
  }
  if (!streams.some((s) => s.codec_type === "video") || !isFinite(duration) || duration <= 0) {
    throw new UploadError("That file isn't a video we can read. Try an MP4 or MOV.")
  }
  return { durationSec: duration, hasAudio: streams.some((s) => s.codec_type === "audio") }
}

/** Decodes a file's audio to mono float samples at SAMPLE_RATE. */
export async function decodeAudio(file: string): Promise<Float32Array> {
  const { stdout } = await run(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-"],
    { encoding: "buffer", maxBuffer: 1 << 30 },
  )
  // Copy so the samples are aligned for a Float32Array view.
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.length - (stdout.length % 4)))
}

/** Gets the video behind a link into `dir` as original.<ext>, and says what it is called. Throws if it can't. */
export type VideoFetcher = (url: string, dir: string) => Promise<{ original: string; title: string }>

/** Personal-use fetch of a TikTok, YouTube or Instagram link with yt-dlp, run as a Python module (python -m yt_dlp) since the yt-dlp.exe launcher can be blocked by Windows policy. */
export const fetchWithYtDlp: VideoFetcher = async (url, dir) => {
  const { stdout } = await run(
    "python",
    ["-m", "yt_dlp", "--no-playlist", "--max-filesize", "1G", "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
      "-o", join(dir, "original.%(ext)s"), "--print", "title", "--no-simulate", "--", url],
    { timeout: 10 * 60_000 },
  )
  const file = (await readdir(dir)).find((f) => f.startsWith("original.") && !f.endsWith(".part"))
  if (!file) throw new Error("yt-dlp saved nothing")
  return { original: join(dir, file), title: stdout.trim().split(/\r?\n/)[0] }
}
