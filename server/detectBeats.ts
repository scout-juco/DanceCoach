/**
 * Beat detection: decoded mono audio in, a starting guess out (bpm, first beat, confidence).
 *
 * ffmpeg decodes the audio (server/audio.ts); essentia.js (WebAssembly) finds the beats.
 * This is only ever a guess for the dancer to review, so it favours a plain, plausible answer
 * over a clever one. Pure apart from loading the WebAssembly module: no files, no ffmpeg.
 */
import { createRequire } from "node:module"

export const SAMPLE_RATE = 44100

export interface BeatGuess {
  /** Whole beats per minute. */
  bpm: number
  /** Time in seconds of the first beat at or after the trim start. */
  firstBeatSec: number
  /** 0 (a coin toss) to 1 (a clear, steady beat). */
  confidence: number
}

// essentia.js ships CommonJS; its RhythmExtractor2013 confidence runs 0–5.32, and above 3.5 is "excellent".
const EXCELLENT = 3.5

let essentia: any
function engine(): any {
  if (!essentia) {
    const { Essentia, EssentiaWASM } = createRequire(import.meta.url)("essentia.js")
    essentia = new Essentia(EssentiaWASM)
  }
  return essentia
}

/** Finds the tempo and first beat in mono audio at SAMPLE_RATE. Throws if no beat can be found. */
export function detectBeats(audio: Float32Array, trimStart = 0): BeatGuess {
  const e = engine()
  const input = e.arrayToVector(audio)
  const out = e.RhythmExtractor2013(input, 208, "multifeature", 40)
  const ticks: number[] = Array.from(e.vectorToArray(out.ticks))
  input.delete?.()
  const first = ticks.find((t) => t >= trimStart)
  if (!out.bpm || first === undefined) throw new Error("Couldn't find a beat in the audio.")
  return {
    bpm: Math.round(out.bpm),
    firstBeatSec: Math.round(first * 1000) / 1000,
    confidence: Math.round(Math.min(1, Math.max(0, out.confidence / EXCELLENT)) * 100) / 100,
  }
}
