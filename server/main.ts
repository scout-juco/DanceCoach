/** Starts the ingest server: npm run server  (PORT, STORAGE_DIR and PUBLIC_URL override the defaults). */
import { createIngestServer } from "./ingestServer"
import { startupBanner } from "./phoneUrl"

const port = Number(process.env.PORT ?? 8787)
createIngestServer({ storageDir: process.env.STORAGE_DIR ?? "server-data" }).listen(port, async () => {
  console.log(await startupBanner(port))
})
