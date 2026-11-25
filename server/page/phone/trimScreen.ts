/** P3, Trim + pick dancer. */
import type { DancePackage, FocusRect } from "../../../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { backHeader, button, chip, el } from "./kit"
import type { Ctx, Screen } from "./screens"
import { contentBox, endLabel, fetchDraft, focusFromDrag, frameTimes, LOADING_TEXT, moveEnd, moveStart, PICK_HELP, PICKED_HELP, splitPackage, startLabel, startSplit, timeAtPointer, trackPosition, type TrimState } from "./trim"

const VIDEO_W = 240
const VIDEO_H = 428

export function trimScreen(ctx: Ctx, id: string): Screen {
  const root = el("main", "screen")
  const status = el("p", "body-text", { role: "status" }, LOADING_TEXT)
  const error = el("p", "error", { role: "alert" })
  error.hidden = true
  root.append(backHeader("Trim + pick dancer", () => ctx.go("#/add")), status, error)

  let disposed = false
  let cleanup = () => {}
  void fetchDraft(id).then((loaded) => {
    if (disposed) return
    if (!loaded.ok) {
      status.hidden = true
      error.textContent = loaded.error
      error.hidden = false
      return
    }
    status.remove()
    error.remove()
    cleanup = build(ctx, root, loaded.package)
  })
  return {
    root,
    dispose: () => {
      disposed = true
      cleanup()
    },
  }
}

/** The screen once the draft is in. Returns what to undo when the screen goes. */
function build(ctx: Ctx, root: HTMLElement, draft: DancePackage): () => void {
  const src = `/dances/${encodeURIComponent(draft.id)}/original`
  let state: TrimState = { trim: { ...draft.trim }, firstBeatSec: draft.firstBeatSec }
  let focus: FocusRect | null = null
  let duration = draft.trim.end

  // The picture: the video fitted inside 240×428; the dancer's box is drawn over the part the video fills.
  const video = el("video", "trim-video", { src, muted: "", playsinline: "", preload: "auto", "aria-label": "Your video" }) as HTMLVideoElement
  video.muted = true
  const pick = el("div", "pick-box")
  pick.hidden = true
  const learning = el("span", "learning-chip", {}, chip("LEARNING", { height: 28 }))
  learning.firstElementChild!.classList.add("volt")
  pick.append(learning)
  const stage = el("div", "trim-stage", { role: "group", "aria-label": "Pick the dancer" }, video, pick)
  stage.style.width = `${VIDEO_W}px`
  stage.style.height = `${VIDEO_H}px`
  const help = el("p", "pick-help", {}, PICK_HELP)

  // The trim bar.
  const thumbs = Array.from({ length: 8 }, () => el("div", "trim-frame"))
  const dimLeft = el("div", "trim-dim left")
  const dimRight = el("div", "trim-dim right")
  const outline = el("div", "trim-outline")
  const startHandle = el("button", "trim-handle", { type: "button", "aria-label": "Trim start" })
  const endHandle = el("button", "trim-handle", { type: "button", "aria-label": "Trim end" })
  const track = el("div", "trim-track", { role: "group", "aria-label": "Trim" }, ...thumbs, dimLeft, dimRight, outline, startHandle, endHandle)
  const startText = el("div", "", {}, startLabel(state.trim.start))
  const endText = el("div", "", {}, endLabel(state.trim.end))
  const split = button("Split into sections")
  root.append(stage, help, el("div", "trim-bar", {}, track, el("div", "trim-labels", {}, startText, endText)), el("div", "footer", {}, split))

  const drawTrim = () => {
    const from = trackPosition(state.trim.start, duration)
    const to = trackPosition(state.trim.end, duration)
    dimLeft.style.width = from
    dimRight.style.left = to
    outline.style.left = from
    outline.style.right = `calc(100% - ${to})`
    startHandle.style.left = from
    endHandle.style.left = to
    startText.textContent = startLabel(state.trim.start)
    endText.textContent = endLabel(state.trim.end)
  }

  const content = () => contentBox(VIDEO_W, VIDEO_H, video.videoWidth, video.videoHeight)
  const drawPick = () => {
    pick.hidden = !focus
    help.textContent = focus ? PICKED_HELP : PICK_HELP
    if (!focus) return
    const c = content()
    const top = c.y + focus.y * c.h
    pick.style.left = `${c.x + focus.x * c.w}px`
    pick.style.top = `${top}px`
    pick.style.width = `${focus.w * c.w}px`
    pick.style.height = `${focus.h * c.h}px`
    // The chip sits above the box; with no room above, it moves inside.
    pick.classList.toggle("chip-inside", top < 36)
  }

  // The frames on the trim bar are taken from a second copy of the video, so the picture above stays where it is.
  const sampler = el("video", "", { src, muted: "", playsinline: "", preload: "auto" }) as HTMLVideoElement
  sampler.muted = true
  let gone = false
  const sample = async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 72
    canvas.height = 80
    const g = canvas.getContext("2d")
    if (!g) return
    for (const [i, t] of frameTimes(duration).entries()) {
      if (gone) return
      try {
        await new Promise<void>((ok, fail) => {
          sampler.onseeked = () => ok()
          sampler.onerror = () => fail(new Error("seek"))
          sampler.currentTime = t
        })
        const vw = sampler.videoWidth || 1
        const vh = sampler.videoHeight || 1
        const scale = Math.max(canvas.width / vw, canvas.height / vh)
        g.drawImage(sampler, (canvas.width - vw * scale) / 2, (canvas.height - vh * scale) / 2, vw * scale, vh * scale)
        thumbs[i].style.backgroundImage = `url(${canvas.toDataURL("image/jpeg", 0.6)})`
      } catch {
        return // the grey tiles stay
      }
    }
  }
  sampler.addEventListener("loadedmetadata", () => {
    if (isFinite(sampler.duration) && sampler.duration > 0) duration = sampler.duration
    drawTrim()
    void sample()
  }, { once: true })
  video.addEventListener("loadedmetadata", () => {
    video.currentTime = state.trim.start
    drawPick()
  }, { once: true })

  // Dragging a handle moves the trim point and shows that frame.
  let dragging: "start" | "end" | null = null
  const seekTo = (t: number) => {
    if (isFinite(t)) video.currentTime = t
  }
  track.addEventListener("pointerdown", (e) => {
    const target = e.target as Element
    dragging = target === startHandle ? "start" : target === endHandle ? "end" : null
    track.setPointerCapture(e.pointerId)
    if (!dragging) seekTo(timeAtPointer(e.clientX, track.getBoundingClientRect().left, track.clientWidth, duration))
  })
  track.addEventListener("pointermove", (e) => {
    if (!track.hasPointerCapture(e.pointerId)) return
    const r = track.getBoundingClientRect()
    const t = timeAtPointer(e.clientX, r.left, r.width, duration)
    if (dragging === "start") state = moveStart({ ...state, bpm: draft.bpm }, t)
    else if (dragging === "end") state = moveEnd({ ...state, bpm: draft.bpm }, t, duration)
    else return seekTo(t)
    drawTrim()
    seekTo(dragging === "start" ? state.trim.start : state.trim.end)
  })
  const release = () => (dragging = null)
  track.addEventListener("pointerup", release)
  track.addEventListener("pointercancel", release)
  // Handles also move with the arrow keys, a tenth of a second at a time.
  for (const [handle, which] of [[startHandle, "start"], [endHandle, "end"]] as const) {
    handle.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowLeft" ? -0.1 : e.key === "ArrowRight" ? 0.1 : 0
      if (!step) return
      e.preventDefault()
      const t = (which === "start" ? state.trim.start : state.trim.end) + step
      state = which === "start" ? moveStart({ ...state, bpm: draft.bpm }, t) : moveEnd({ ...state, bpm: draft.bpm }, t, duration)
      drawTrim()
      seekTo(which === "start" ? state.trim.start : state.trim.end)
    })
  }

  // Dragging on the picture draws the dancer's box; a tap clears it.
  let from: { x: number; y: number } | null = null
  const point = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * VIDEO_W, y: ((e.clientY - r.top) / r.height) * VIDEO_H }
  }
  stage.addEventListener("pointerdown", (e) => {
    from = point(e)
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener("pointermove", (e) => {
    if (!from) return
    focus = focusFromDrag(from, point(e), content()) ?? focus
    drawPick()
  })
  stage.addEventListener("pointerup", (e) => {
    if (!from) return
    const box = focusFromDrag(from, point(e), content())
    if (box) focus = box
    else focus = null
    from = null
    drawPick()
  })
  stage.addEventListener("pointercancel", () => (from = null))

  split.addEventListener("click", () => {
    const token = ctx.getToken()
    if (!token) return ctx.go("#/pair")
    split.disabled = true
    void startSplit(splitPackage(draft, state, focus), token)
    ctx.go(`#/processing/${encodeURIComponent(draft.id)}`)
  })

  drawTrim()
  drawPick()
  return () => {
    gone = true
    video.pause()
    video.removeAttribute("src")
    sampler.removeAttribute("src")
    sampler.load()
  }
}
