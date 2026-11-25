/** Adjust section starts: not in the handoff, built from the kit (rows, secondary icon buttons, inputs). */
import type { DancePackage } from "../../../DanceCoachLens/Assets/Scripts/Core/DancePackage"
import { backHeader, button, el, iconButton, segmented } from "./kit"
import { fetchPackage, savePackage } from "./ready"
import { clearNudges, parseStart, sectionStarts, setSectionStart, startText, stepSectionStart, STEP_LABELS, STEPS, type SectionEdit } from "./sections"
import type { Ctx, Screen } from "./screens"

const VIDEO_W = 135
const VIDEO_H = 240

export function sectionsScreen(ctx: Ctx, id: string): Screen {
  const root = el("main", "screen")
  const back = () => ctx.go(`#/dance/${encodeURIComponent(id)}`)
  const status = el("p", "body-text", { role: "status" }, "Getting your dance…")
  const error = el("p", "error", { role: "alert" })
  error.hidden = true
  root.append(backHeader("Adjust section starts", back), status, error)

  let disposed = false
  let cleanup = () => {}
  void fetchPackage(id).then((loaded) => {
    if (disposed) return
    if (!loaded.ok) {
      status.hidden = true
      error.textContent = loaded.error
      error.hidden = false
      return
    }
    status.remove()
    error.remove()
    cleanup = build(ctx, root, loaded.package, back)
  })
  return {
    root,
    dispose: () => {
      disposed = true
      cleanup()
    },
  }
}

function build(ctx: Ctx, root: HTMLElement, original: DancePackage, back: () => void): () => void {
  let pkg = original
  let step: number = STEPS[0]
  let saving = false

  const video = el("video", "trim-video", { src: `/dances/${encodeURIComponent(pkg.id)}/original`, muted: "", playsinline: "", preload: "auto", "aria-label": "Your video" }) as HTMLVideoElement
  video.muted = true
  const stage = el("div", "trim-stage small", {}, video)
  stage.style.width = `${VIDEO_W}px`
  stage.style.height = `${VIDEO_H}px`
  const help = el("p", "pick-help", {}, "Step a section's start until the video shows where it begins, or type a time. Times are seconds into the routine.")
  const message = el("p", "error", { role: "alert" })
  message.hidden = true
  const list = el("div", "section-list")
  const reset = button("Reset to the beat", { kind: "secondary", height: 44, small: true })
  reset.classList.add("inline")
  const done = button("Done")
  root.append(
    stage,
    help,
    segmented("Step size", STEP_LABELS, 0, (i) => (step = STEPS[i])),
    list,
    el("div", "", {}, reset),
    el("div", "footer", {}, message, done),
  )

  const say = (text: string) => {
    message.textContent = text
    message.hidden = !text
  }
  const show = (n: number) => {
    video.currentTime = sectionStarts(pkg)[n - 1]
  }
  const apply = (edit: SectionEdit, n: number) => {
    if (!edit.ok) {
      say(edit.error)
      return false
    }
    say("")
    pkg = edit.package
    draw()
    show(n)
    return true
  }

  const draw = () => {
    reset.hidden = !pkg.sections
    list.replaceChildren(
      ...sectionStarts(pkg).map((start, i) => {
        const n = i + 1
        const field = el("input", "input start-input", { type: "text", inputmode: "decimal", autocomplete: "off", "aria-label": `Section ${n} start, seconds into the routine` }) as HTMLInputElement
        field.value = startText(pkg, start)
        const commit = () => {
          if (apply(setSectionStart(pkg, n, parseStart(pkg, field.value)), n)) return
          field.value = startText(pkg, sectionStarts(pkg)[i]) // the typed value was refused: show what stands
        }
        field.addEventListener("change", commit)
        field.addEventListener("keydown", (e) => {
          if (e.key === "Enter") commit()
        })
        field.addEventListener("focus", () => show(n))
        return el(
          "div",
          "section-row",
          {},
          el("div", "row-title", {}, `Section ${n}`),
          el("div", "step-controls", {}, iconButton("chevron-left", `Section ${n} starts earlier`, { size: 40, onClick: () => apply(stepSectionStart(pkg, n, -step), n) }), field, iconButton("chevron-right", `Section ${n} starts later`, { size: 40, onClick: () => apply(stepSectionStart(pkg, n, step), n) })),
        )
      }),
    )
  }
  reset.addEventListener("click", () => {
    pkg = clearNudges(pkg)
    say("")
    draw()
  })
  video.addEventListener("loadedmetadata", () => show(1), { once: true })

  done.addEventListener("click", async () => {
    if (saving) return
    const token = ctx.getToken()
    if (!token) return ctx.go("#/pair")
    if (JSON.stringify(pkg) === JSON.stringify(original)) return back()
    saving = true
    done.disabled = true
    done.textContent = "Saving…"
    say("")
    // The server cuts the clips again for the new starts; the saved dance plays them on the Specs.
    const result = await savePackage(pkg, token)
    if (result.ok) return back()
    saving = false
    done.disabled = false
    done.textContent = "Done"
    say(result.error)
  })

  draw()
  return () => {
    video.pause()
    video.removeAttribute("src")
  }
}
