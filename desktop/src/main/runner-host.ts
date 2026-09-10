import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { runnerEnv } from './secrets'
import type { JobEvent, JobRequest } from '../runner/protocol'

/**
 * Owns the runner process and the job queue.
 *
 * **One job at a time, globally** — not one per host. The per-host throttle in
 * `src/lib/http.ts` would technically allow two different retailers in
 * parallel, but six shops hit at once from a single home connection is the
 * aggregate rudeness the staggered CI schedule exists to avoid. The queue is the
 * enforcement.
 */

export type JobSpec =
  | { kind: 'scrape'; shop: string; categories?: string[]; maxProducts?: number; dryRun?: boolean }
  | { kind: 'normalize'; limit?: number; redo?: boolean; dryRun?: boolean }

export type JobOutcome =
  | { ok: true; result: unknown; logTail: string }
  | { ok: false; error: string; logTail: string }

type Waiter = { resolve: (o: JobOutcome) => void; lines: string[] }

/** How long to wait after killing the runner before starting anything else. */
const KILL_COOLDOWN_MS = 5_000

export type RunnerEvents = {
  onLog: (line: string, job: JobSpec) => void
  onRuntime: (runtime: { fetch: boolean; abort: boolean; getSetCookie: boolean }) => void
}

export class RunnerHost {
  private child: UtilityProcess | null = null
  private waiters = new Map<string, Waiter>()
  private busyWith: JobSpec | null = null
  private cooldownUntil = 0

  constructor(
    private readonly runnerPath: string,
    private readonly events: RunnerEvents,
  ) {}

  get busy(): JobSpec | null {
    return this.busyWith
  }

  private spawn(): UtilityProcess {
    if (this.child) return this.child

    // The env is supplied at fork time, so it is already in place before any of
    // the runner's imports evaluate. `src/lib/http.ts` captures the delay floor
    // and user-agent at module load, and `getDb()` caches its client on first
    // use — handing configuration over afterwards would be too late.
    //
    // It must *extend* the parent environment, not replace it. `env` here is
    // the whole environment, and a utility process given only three variables
    // cannot resolve DNS on Windows: every request fails with EAI_FAIL behind
    // a bare "TypeError: fetch failed". Plain Node does not behave this way,
    // which is why it survived the Phase 0 probe and only broke in the app.
    const inherited: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) inherited[key] = value
    }
    // The two settings this app owns are cleared first, so a value in the
    // launching shell can never weaken the throttle or the user-agent.
    delete inherited.SCRAPER_DELAY_MS
    delete inherited.SCRAPER_USER_AGENT

    const child = utilityProcess.fork(this.runnerPath, [], {
      env: { ...inherited, ...runnerEnv(), NODE_ENV: 'production' },
      stdio: 'ignore',
      serviceName: 'pcmaker-runner',
    })

    child.on('message', (event: JobEvent) => this.receive(event))
    child.on('exit', () => {
      this.child = null
      // Anything still waiting will never hear back.
      for (const [jobId, waiter] of this.waiters) {
        waiter.resolve({ ok: false, error: 'The runner exited.', logTail: waiter.lines.join('\n') })
        this.waiters.delete(jobId)
      }
      this.busyWith = null
    })

    this.child = child
    return child
  }

  private receive(event: JobEvent) {
    if (event.type === 'ready') {
      this.events.onRuntime(event.runtime)
      return
    }

    const waiter = this.waiters.get(event.jobId)
    if (!waiter) return

    if (event.type === 'log') {
      waiter.lines.push(event.line)
      if (this.busyWith) this.events.onLog(event.line, this.busyWith)
      return
    }

    this.waiters.delete(event.jobId)
    this.busyWith = null
    waiter.resolve(
      event.ok
        ? { ok: true, result: event.result, logTail: waiter.lines.join('\n') }
        : { ok: false, error: event.error, logTail: waiter.lines.join('\n') },
    )
  }

  /** Runs a job. Callers must serialise — the scheduler owns the queue. */
  async run(spec: JobSpec): Promise<JobOutcome> {
    const wait = this.cooldownUntil - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))

    const child = this.spawn()
    const jobId = randomUUID()
    this.busyWith = spec

    const request: JobRequest =
      spec.kind === 'scrape'
        ? {
            type: 'scrape',
            jobId,
            shop: spec.shop,
            categories: spec.categories,
            maxProducts: spec.maxProducts,
            dryRun: spec.dryRun,
          }
        : { type: 'normalize', jobId, limit: spec.limit, redo: spec.redo, dryRun: spec.dryRun }

    return new Promise<JobOutcome>((resolve) => {
      this.waiters.set(jobId, { resolve, lines: [] })
      child.postMessage(request)
    })
  }

  /**
   * Stop the running job.
   *
   * `runScraper` takes no AbortSignal, so killing the process is the only way to
   * stop an in-flight scrape. That discards the per-host throttle map with it,
   * so the next request could otherwise follow the last one immediately — the
   * one place this app is measurably less polite than `npm run scrape`. The
   * cooldown pays that back before anything else starts.
   */
  cancel() {
    if (!this.child) return
    this.child.kill()
    this.child = null
    this.busyWith = null
    this.cooldownUntil = Date.now() + KILL_COOLDOWN_MS
  }

  dispose() {
    this.child?.kill()
    this.child = null
  }
}

export function runnerPathFor(dist: string): string {
  return join(dist, 'runner.cjs')
}
