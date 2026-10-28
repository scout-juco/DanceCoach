/** Starts the ingest server: npm run server  (PORT and STORAGE_DIR override the defaults). */
import { createIngestServer } from "./ingestServer"

const port = Number(process.env.PORT ?? 8787)
createIngestServer({ storageDir: process.env.STORAGE_DIR ?? "server-data" }).listen(port, () => {
  console.log(`Ingest server on http://localhost:${port}`)
})
