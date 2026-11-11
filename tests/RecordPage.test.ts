import { mkdtempSync, rmSync } from "node:fs"
import { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createIngestServer } from "../server/ingestServer"

const work = mkdtempSync(join(tmpdir(), "record-page-"))
const server = createIngestServer({ storageDir: work })
let base = ""

beforeAll(async () => {
  await new Promise<void>((ok) => server.listen(0, ok))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  rmSync(work, { recursive: true, force: true })
})

describe("the phone recorder page", () => {
  it("is served at /record, beside the adjust page", async () => {
    const page = await fetch(`${base}/record`)
    expect(page.status).toBe(200)
    expect(page.headers.get("content-type")).toContain("text/html")
    const html = await page.text()
    expect(html).toContain('src="/record.js"')
    expect((await fetch(`${base}/`)).status).toBe(200)
  })

  it("serves its bundled script, which polls the recorder state", async () => {
    const script = await fetch(`${base}/record.js`)
    expect(script.status).toBe(200)
    expect(script.headers.get("content-type")).toContain("javascript")
    const text = await script.text()
    expect(text).toContain("/recorder/state")
    expect(text).toContain("/upload")
  })
})
