/**
 * Client script of the phone recorder page (bundled and served as /record.js).
 *
 * The page polls /recorder/state, which is also its heartbeat. When the glasses arm a take it starts
 * recording; when the session stops it uploads the recording and lists the take.
 */

interface Take { name: string; section: number; speed: number; mirror: boolean; number: number }
interface Session { id: string; danceId: string; state: string }

const POLL_MS = 300
/** Keeps filming this long after the glasses stop (the same as the server's RECORD_TAIL_SEC), so the take's end isn't cut short. */
const TAIL_MS = 1000
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const preview = $<HTMLVideoElement>("preview")
const danceSelect = $<HTMLSelectElement>("dance")
const flip = $<HTMLButtonElement>("flip")
const progress = $<HTMLProgressElement>("progress")

let stream: MediaStream | null = null
let facing: "environment" | "user" = "environment"
let wakeLock: { release(): Promise<void> } | null = null
/** What the phone is filming now; null when idle. */
let rec: { sid: string; danceId: string; recorder: MediaRecorder; chunks: Blob[]; discard: boolean; startedAt: number } | null = null
/** The server's clock minus this phone's, in ms, worked out from each poll (the server's time is taken at the poll's midpoint). */
let clockOffset = 0
let uploading = false
let message = ""
let lastSeenBeat = false

const readable = (err: unknown) => (err instanceof Error ? err.message : String(err))

function setMessage(text: string, isError = false) {
  message = text
  const el = $("message")
  el.hidden = !text
  el.textContent = text
  el.classList.toggle("error", isError)
}

function setStatus(text: string, kind: "" | "connected" | "recording") {
  $("status").className = `status ${kind}`
  $("statusText").textContent = text
}

function showStatus(session: Session | null) {
  $("recBadge").hidden = !rec
  flip.disabled = !!rec || uploading
  if (rec) return setStatus("● REC · filming the take", "recording")
  if (uploading) return setStatus("Uploading the take…", "connected")
  if (!stream) return setStatus("Camera not open", "")
  setStatus(session ? "Armed · getting ready" : "Connected · waiting for the glasses", "connected")
}

/** Why the camera can't open, as the dancer should read it. */
function cameraProblem(err: unknown): string {
  const name = (err as DOMException)?.name
  if (name === "NotAllowedError") return "The camera is blocked. Allow camera and microphone for this page in the browser's settings, then reload."
  if (name === "NotFoundError") return "This phone has no camera the page can use."
  return `The camera won't open (${readable(err)}).`
}

async function keepAwake() {
  try {
    wakeLock = await (navigator as any).wakeLock?.request("screen")
  } catch {
    wakeLock = null // refused (e.g. battery saver): the screen may sleep, nothing else breaks
  }
}

async function openCamera() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (!navigator.mediaDevices?.getUserMedia) return showStatus(null)
  try {
    // Audio processing is off: the server lines the take up by hearing the music, not a cleaned-up voice.
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    preview.srcObject = stream
    flip.textContent = facing === "environment" ? "Front camera" : "Rear camera"
    setMessage("")
    void keepAwake()
  } catch (err) {
    setMessage(cameraProblem(err), true)
  }
  showStatus(null)
}

function startRecording(session: Session) {
  if (!stream) return
  const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m))
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {})
  const current = { sid: session.id, danceId: session.danceId, recorder, chunks: [] as Blob[], discard: false, startedAt: 0 }
  recorder.ondataavailable = (e) => e.data.size && current.chunks.push(e.data)
  recorder.onstop = () => {
    if (!current.discard) void upload(current)
  }
  recorder.start(1000)
  // The recording's first frame is when start() was called, in the server's time: what the server lines the clip up from.
  current.startedAt = Date.now() + clockOffset
  rec = current
  setMessage("")
}

/** Ends the recording; its data is sent unless the session was replaced. */
function stopRecording(discard: boolean) {
  if (!rec) return
  const current = rec
  rec = null
  current.discard = discard
  const stop = () => current.recorder.state !== "inactive" && current.recorder.stop()
  if (discard) stop()
  else setTimeout(stop, TAIL_MS)
}

function upload(current: NonNullable<typeof rec>): Promise<void> {
  const blob = new Blob(current.chunks, { type: current.recorder.mimeType })
  uploading = true
  progress.hidden = false
  progress.value = 0
  showStatus(null)
  return new Promise((done) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `/takes/session/${current.sid}/upload`)
    xhr.setRequestHeader("Content-Type", blob.type || "video/mp4")
    xhr.setRequestHeader("X-Recording-Started", String(current.startedAt))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress.value = e.loaded / e.total
    }
    const finish = (text: string, isError: boolean) => {
      uploading = false
      progress.hidden = true
      setMessage(text, isError)
      showStatus(null)
      done()
    }
    xhr.onload = () => {
      let body: any = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status === 200) {
        finish("Take saved.", false)
        if (danceSelect.value !== current.danceId && [...danceSelect.options].some((o) => o.value === current.danceId)) danceSelect.value = current.danceId
        void listTakes()
      } else {
        finish(body.error ?? "The take didn't save. Record again.", true)
      }
    }
    xhr.onerror = () => finish("The recording didn't reach the server. Check the connection and record again.", true)
    xhr.send(blob)
  })
}

let polling = false
async function poll() {
  if (polling) return
  polling = true
  try {
    const sent = Date.now()
    const res = await fetch("/recorder/state", { cache: "no-store" })
    const { session, serverTime } = (await res.json()) as { session: Session | null; serverTime: number }
    if (typeof serverTime === "number") clockOffset = serverTime - (sent + Date.now()) / 2
    lastSeenBeat = true
    const active = session && (session.state === "armed" || session.state === "recording") ? session : null
    if (active && !uploading) {
      if (rec && rec.sid !== active.id) stopRecording(true)
      if (!rec) {
        if (stream) startRecording(active)
        else setMessage("A take is armed but the camera isn't open. Fix the camera, then record again.", true)
      }
    } else if (rec) {
      // No longer armed or recording: the glasses stopped, so the whole recording goes up.
      stopRecording(false)
    }
    showStatus(active)
  } catch {
    if (lastSeenBeat) setStatus("Can't reach the server", "")
    lastSeenBeat = false
  } finally {
    polling = false
  }
}

async function listTakes() {
  const id = danceSelect.value
  if (!id) return
  const res = await fetch(`/dances/${id}/takes`, { cache: "no-store" })
  if (id !== danceSelect.value || !res.ok) return
  renderTakes(id, (await res.json()) as Take[])
}

function renderTakes(id: string, takes: Take[]) {
  const groups = $("takeGroups")
  groups.replaceChildren()
  $("noTakes").hidden = takes.length > 0
  const sections = [...new Set(takes.map((t) => t.section))].sort((a, b) => a - b)
  for (const section of sections) {
    const heading = document.createElement("h2")
    heading.textContent = `Section ${section}`
    const list = document.createElement("ul")
    list.className = "takes"
    for (const take of takes.filter((t) => t.section === section).sort((a, b) => a.number - b.number)) {
      const li = document.createElement("li")
      const label = document.createElement("span")
      label.className = "label"
      label.textContent = `Take ${take.number} · ${take.speed}×`
      const meta = document.createElement("span")
      meta.className = "meta"
      meta.textContent = take.mirror ? "mirrored" : ""
      const del = document.createElement("button")
      del.className = "chip"
      del.textContent = "Delete"
      del.onclick = async () => {
        if (!confirm(`Delete section ${section}, take ${take.number}?`)) return
        del.disabled = true
        const res = await fetch(`/dances/${id}/takes/${take.name}`, { method: "DELETE" })
        if (res.ok || res.status === 404) await listTakes()
        else {
          del.disabled = false
          setMessage("That take didn't delete. Try again.", true)
        }
      }
      li.append(label, meta, del)
      list.append(li)
    }
    groups.append(heading, list)
  }
}

async function loadDances() {
  const dances = (await (await fetch("/dances", { cache: "no-store" })).json()) as { id: string; title: string }[]
  $("noDances").hidden = dances.length > 0
  danceSelect.replaceChildren(...dances.map((d) => new Option(d.title, d.id)))
  let remembered: string | null = null
  try {
    remembered = localStorage.getItem("recorderDance")
  } catch {}
  if (remembered && dances.some((d) => d.id === remembered)) danceSelect.value = remembered
  $("cam").hidden = dances.length === 0
  if (dances.length > 0) {
    await openCamera()
    await listTakes()
  }
}

danceSelect.onchange = () => {
  try {
    localStorage.setItem("recorderDance", danceSelect.value)
  } catch {}
  void listTakes()
}
flip.onclick = () => {
  facing = facing === "environment" ? "user" : "environment"
  void openCamera()
}
// The browser drops the wake lock when the page is hidden; take it again on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && stream) void keepAwake()
})

if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  $("insecure").hidden = false
}
setInterval(poll, POLL_MS)
void poll()
loadDances().catch((err) => setMessage(`Couldn't load the dances: ${readable(err)}`, true))
