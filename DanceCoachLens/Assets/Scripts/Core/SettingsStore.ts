/**
 * SettingsStore: speed, mirror and counts as a string for Lens persistent storage.
 *
 * Pure: the Lens reads and writes the string; this only encodes and validates it,
 * so a missing or damaged entry falls back to the defaults instead of breaking playback.
 */
import { DEFAULT_SETTINGS, Settings, Speed } from "./PlaybackController"

/** The persistent storage key the settings live under. */
export const SETTINGS_KEY = "danceCoach.settings"

const SPEEDS: Speed[] = [0.5, 0.75, 1]

export function encodeSettings(settings: Settings): string {
  return JSON.stringify({ speed: settings.speed, mirror: settings.mirror, counts: settings.counts })
}

/** Reads saved settings; anything missing or invalid takes its default. */
export function decodeSettings(raw: string | null | undefined): Settings {
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch (e) {
    data = null
  }
  if (!data || typeof data !== "object") return { ...DEFAULT_SETTINGS }
  return {
    speed: SPEEDS.indexOf(data.speed) >= 0 ? data.speed : DEFAULT_SETTINGS.speed,
    mirror: typeof data.mirror === "boolean" ? data.mirror : DEFAULT_SETTINGS.mirror,
    counts: typeof data.counts === "boolean" ? data.counts : DEFAULT_SETTINGS.counts,
  }
}
