import { hostname } from 'node:os'
import { and, eq, isNull, lt, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { pipelineRuns } from '@/db/schema'
import type { NormalizeResult } from './normalize'
import type { RunResult } from './scrape'

/**
 * Recording — and serialising — pipeline runs.
 *
 * Deliberately *not* called from inside `runScraper`/`runNormalize`. Those are
 * also used for dry runs and smoke tests, and only the caller knows whether it
 * is CI, a terminal or the desktop app. Keeping this at the caller means the
 * pipeline stays a pure function of its inputs.
 *
 * The row doubles as a lease: `startRun` inserts `status='running'` *before* the
 * work begins, and a partial unique index rejects a second concurrent run of the
 * same shop. See the index in `drizzle/0003_*.sql`.
 */

export type Actor = 'ci' | 'desktop' | 'cli'

export type RunHandle = { id: number }

/** CI sets GITHUB_ACTIONS; anything else from a terminal is a person. */
export function detectActor(): Actor {
  return process.env.GITHUB_ACTIONS ? 'ci' : 'cli'
}

export class RunInProgressError extends Error {
  constructor(what: string) {
    super(
      `Another ${what} run is already in progress. ` +
        `Wait for it to finish rather than doubling the load on the retailer.`,
    )
    this.name = 'RunInProgressError'
  }
}

/**
 * Postgres unique-violation. Here it means "someone else holds the lease".
 *
 * The code has to be looked for down the `cause` chain: drizzle rethrows driver
 * errors wrapped in a plain `Error` whose message is the failed SQL, and the
 * `NeonDbError` carrying `code: '23505'` is the cause. Checking only the top
 * error silently misclassifies every collision as an unexpected crash — which
 * is exactly the case this whole mechanism exists to handle gracefully.
 */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    const candidate = e as { code?: string; message?: string; cause?: unknown }
    if (candidate.code === '23505') return true
    if (typeof candidate.message === 'string' && /duplicate key value/i.test(candidate.message)) {
      return true
    }
    e = candidate.cause
  }
  return false
}

export type StartOptions = {
  kind: 'scrape' | 'normalize'
  shop?: string
  actor?: Actor
  dryRun?: boolean
}

/**
 * Claim the lease and open a run row.
 *
 * Returns `null` — meaning "carry on, just don't record" — when there is no
 * database configured or this is a dry run. A `--dry-run` scrape is documented
 * to work with no credentials at all (`src/db/index.ts`), and that must keep
 * being true; recording is a convenience, never a prerequisite for running.
 *
 * Throws `RunInProgressError` when another actor holds the lease.
 */
export async function startRun(opts: StartOptions): Promise<RunHandle | null> {
  if (!process.env.DATABASE_URL || opts.dryRun) return null

  try {
    const [row] = await getDb()
      .insert(pipelineRuns)
      .values({
        kind: opts.kind,
        shop: opts.shop ?? null,
        actor: opts.actor ?? detectActor(),
        host: hostname(),
        dryRun: false,
        status: 'running',
      })
      .returning({ id: pipelineRuns.id })
    return row ? { id: row.id } : null
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new RunInProgressError(opts.shop ? `${opts.shop} scrape` : opts.kind)
    }
    throw err
  }
}

export type FinishOptions = {
  ok: boolean
  result?: RunResult | NormalizeResult
  error?: unknown
  logTail?: string
}

/** Close the run row and release the lease. Never throws. */
export async function finishRun(
  handle: RunHandle | null,
  opts: FinishOptions,
): Promise<void> {
  if (!handle) return

  const isScrape = opts.result !== undefined && 'scraped' in (opts.result as RunResult)
  const scrape = isScrape ? (opts.result as RunResult) : null

  const message =
    opts.error instanceof Error
      ? opts.error.message
      : opts.error !== undefined
        ? String(opts.error)
        : null

  try {
    await getDb()
      .update(pipelineRuns)
      .set({
        status: opts.ok ? 'ok' : 'failed',
        finishedAt: new Date(),
        durationMs: scrape?.durationMs ?? null,
        scraped: scrape?.scraped ?? null,
        inserted: scrape?.inserted ?? null,
        withPrice: scrape?.withPrice ?? null,
        stats: !isScrape && opts.result ? (opts.result as NormalizeResult) : null,
        // First line only: the useful part of an assertPlausible throw is its
        // first sentence, and the rest is a stack nobody reads from a table.
        error: message ? message.split('\n')[0].slice(0, 2000) : null,
        logTail: opts.logTail ? opts.logTail.slice(-4000) : null,
      })
      .where(eq(pipelineRuns.id, handle.id))
  } catch {
    // Losing the record of a run must never fail the run itself. The reaper
    // below closes anything left open.
  }
}

/**
 * Release leases from runs that died without closing their row — a power cut,
 * a killed process, a crashed runner.
 *
 * Three hours is comfortably past the longest real job: nanotek's CI timeout is
 * 90 minutes. Without this, one hard kill would block a shop forever.
 */
export async function reapStaleRuns(olderThanHours = 3): Promise<number> {
  if (!process.env.DATABASE_URL) return 0
  try {
    const res = await getDb()
      .update(pipelineRuns)
      .set({ status: 'abandoned', finishedAt: new Date() })
      .where(
        and(
          eq(pipelineRuns.status, 'running'),
          isNull(pipelineRuns.finishedAt),
          lt(pipelineRuns.startedAt, sql`now() - make_interval(hours => ${olderThanHours})`),
        ),
      )
    return res.rowCount ?? 0
  } catch {
    return 0
  }
}

/** Recent runs, newest first — for the desktop history pane and the web admin. */
/**
 * Each shop's most recent real (not dry-run) scrape attempt by one actor.
 * The desktop scheduler uses it to ask "has CI tried this shop tonight, and how
 * did that go?" instead of guessing from how late it is.
 */
export async function latestScrapeRuns(
  actor: Actor,
): Promise<Map<string, { status: string; startedAt: Date }>> {
  const res = await getDb().execute(sql`
    select distinct on (shop) shop, status, started_at
    from pipeline_runs
    where kind = 'scrape' and actor = ${actor} and dry_run = false and shop is not null
    order by shop, started_at desc
  `)
  return new Map(
    (res.rows as { shop: string; status: string; started_at: string }[]).map((r) => [
      r.shop,
      { status: r.status, startedAt: new Date(r.started_at) },
    ]),
  )
}

export async function recentRuns(limit = 50) {
  const rows = await getDb()
    .select()
    .from(pipelineRuns)
    .orderBy(sql`${pipelineRuns.startedAt} desc`)
    .limit(limit)
  return rows
}
