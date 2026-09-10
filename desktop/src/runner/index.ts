import { runNormalize, runScraper } from './pipeline'
import type { JobEvent, JobRequest } from './protocol'

/**
 * The runner process.
 *
 * A single long-lived `utilityProcess` that owns the entire pipeline for the
 * app's lifetime and runs exactly one job at a time. Both halves of that matter:
 *
 * - **Its own process**, because cheerio parsing is synchronous over ~1MB
 *   documents and nanotek is ~700 products. In the main process that would stall
 *   the tray, the IPC replies and the quit handler for hours.
 *
 * - **Long-lived and single**, because the 1.5s per-host floor in
 *   `src/lib/http.ts` is module-level state. A process per job would give each
 *   its own throttle map and the floor would stop being a floor. `docs/pipeline.md`
 *   is blunt about this: "Do not parallelise requests to one retailer."
 *
 * Credentials arrive in `process.env` at spawn, before any of this file's
 * imports are evaluated — which is what makes the module-load-time capture of
 * `MIN_DELAY_MS` and the cached Neon client harmless.
 */

// `process.parentPort` exists only in an Electron utility process. Typed locally
// so the runner bundle never has to import electron.
type ParentPort = {
  on(event: 'message', cb: (e: { data: JobRequest }) => void): void
  postMessage(message: JobEvent): void
}
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort

function send(event: JobEvent) {
  parentPort?.postMessage(event)
}

async function handle(job: JobRequest) {
  const log = (line: string) => send({ type: 'log', jobId: job.jobId, line })

  try {
    if (job.type === 'ping') {
      send({ type: 'done', jobId: job.jobId, ok: true, result: { pong: true } })
      return
    }

    if (job.type === 'scrape') {
      const result = await runScraper(job.shop, {
        categories: job.categories as never,
        maxProducts: job.maxProducts,
        dryRun: job.dryRun,
        log,
      })
      send({ type: 'done', jobId: job.jobId, ok: true, result })
      return
    }

    const result = await runNormalize({
      limit: job.limit,
      redo: job.redo,
      dryRun: job.dryRun,
      log,
    })
    send({ type: 'done', jobId: job.jobId, ok: true, result })
  } catch (err) {
    send({
      type: 'done',
      jobId: job.jobId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

parentPort?.on('message', (e) => {
  void handle(e.data)
})

// Reported once at startup so the host can verify it got Node's fetch rather
// than a Chromium one. The Tyno scrapers depend on reading Set-Cookie, which
// Chromium's fetch strips as a forbidden response header — and the failure is
// silent, so it is asserted rather than assumed.
send({
  type: 'ready',
  runtime: {
    fetch: typeof globalThis.fetch === 'function',
    abort: typeof globalThis.AbortController === 'function',
    getSetCookie: typeof new Response().headers.getSetCookie === 'function',
  },
})
