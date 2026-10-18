import { powerMonitor } from 'electron'

import { hoursSinceExpectedRun } from '@/lib/site'

import type { RunnerHost, JobSpec } from './runner-host'
import type { AdminQueries } from './monitor'

/**
 * Decides what to sync, and when.
 *
 * **Freshness, not a cron.** A wall-clock schedule on a desktop is exactly the
 * thing that re-scrapes what GitHub Actions already did an hour earlier, and it
 * cannot survive the machine being asleep at 3am. So the tick does not ask "is
 * it time?", it asks "is this shop's data stale?" — and the answer comes from
 * the same `max(raw_listings.scraped_at)` the web dashboard already reports.
 *
 * The consequences are all the ones you want:
 *
 * - A shop CI served since its slot is fresh, so the desktop leaves it alone.
 *   Shops CI cannot reach at all are marked `ci: false` in SHOP_SCHEDULE and
 *   are simply ours at their slot. For the rest, CI's own `pipeline_runs` row
 *   decides: a CI shop whose run failed tonight is picked up straight away,
 *   so a shop that starts blocking CI is covered the same night.
 * - Catch-up is free. There is no missed firing to reconstruct, only staleness
 *   that is still there when the machine wakes up.
 * - A tick that drifts, or is skipped for eight hours of sleep, is harmless.
 */

/**
 * How long after a CI shop's slot the desktop waits for CI to *start*.
 *
 * Only consulted when CI has not tried the shop since its slot. Once it has,
 * CI's own `pipeline_runs` row answers the question: running → leave it, failed
 * → take over now. Guessing from the clock alone is what this replaced: the
 * wait was 2 hours, GitHub starts scheduled runs 2h12m–3h02m late (measured
 * over a week), so the desktop scraped every CI shop just before CI did, and
 * CI then skipped it on the lease. Every retailer got hit twice a night.
 *
 * A fixed staleness threshold does not work either: a healthy shop's age sweeps
 * from 0h to 24h across the day, so any threshold under 24 is crossed shortly
 * before the next CI run. Comparing against the shop's own slot has no such
 * window: if a row landed after the slot, the slot was served.
 */
const CI_START_GRACE_HOURS = 4

/**
 * Never scrape a shop again within this long of its last landed row.
 *
 * "Nothing since the slot" alone re-scrapes a shop that was caught up just
 * before its slot — opened at 20:50 after a missed night, scraped, then scraped
 * again at the 21:00 slot. Seen on live data the first time the rule ran.
 */
const MIN_GAP_HOURS = 12

/** A shop with no known schedule is only chased once it is properly stale. */
const UNSCHEDULED_STALE_HOURS = 26

const TICK_MS = 5 * 60 * 1000

export type SchedulerDeps = {
  runner: RunnerHost
  queries: AdminQueries
  /** Runs one job start-to-finish, including the pipeline_runs lease. */
  execute: (spec: JobSpec, trigger: 'schedule' | 'manual') => Promise<void>
  notify: (title: string, body: string) => void
  isPaused: () => boolean
  /** The user's "skip scheduled syncs on battery" switch. */
  skipOnBattery: () => boolean
}

export type Candidate = { shop: string; ageHours: number; reason: string }

/**
 * Which shops are due, most-stale first.
 *
 * Pure apart from the clock, so it can be asserted against real `getShopSync()`
 * output without running anything.
 */
export function dueShops(
  sync: { shop: string; lastScrapeAgeHours: number }[],
  schedule: Record<string, { cronUtc: string; ci: boolean }>,
  ciRuns: Map<string, { status: string; startedAt: Date }>,
  now = new Date(),
): Candidate[] {
  const out: Candidate[] = []

  for (const row of sync) {
    const age = row.lastScrapeAgeHours

    if (!Number.isFinite(age)) {
      out.push({ shop: row.shop, ageHours: Infinity, reason: 'never scraped' })
      continue
    }

    const entry = schedule[row.shop]
    if (!entry) {
      if (age > UNSCHEDULED_STALE_HOURS) {
        out.push({ shop: row.shop, ageHours: age, reason: `${Math.round(age)}h stale` })
      }
      continue
    }

    const sinceSlot = hoursSinceExpectedRun(entry.cronUtc, now)

    // A row newer than the slot means the slot was served — by CI or by us.
    if (age <= sinceSlot || age < MIN_GAP_HOURS) continue

    let reason: string
    if (!entry.ci) {
      // Ours alone: CI cannot reach this shop, so its slot is our slot.
      reason = 'nightly (desktop-only shop)'
    } else {
      const slotAt = now.getTime() - sinceSlot * 3_600_000
      const attempt = ciRuns.get(row.shop)
      if (attempt && attempt.startedAt.getTime() >= slotAt) {
        // CI has tried since the slot. Running: leave it. A success would have
        // landed rows and been caught above. Failed or abandoned: ours now —
        // there is no point waiting out a grace period for a run that is over.
        if (attempt.status !== 'failed' && attempt.status !== 'abandoned') continue
        reason = `CI ${attempt.status} tonight`
      } else if (sinceSlot <= CI_START_GRACE_HOURS) {
        // CI has not started yet, which is normal for hours after the slot.
        continue
      } else {
        reason = `CI did not run within ${CI_START_GRACE_HOURS}h of its slot`
      }
    }

    const missed = Math.floor(age / 24)
    out.push({
      shop: row.shop,
      ageHours: age,
      reason: missed >= 1 ? `${reason}; missed ${missed} night${missed > 1 ? 's' : ''}` : reason,
    })
  }

  return out.sort((a, b) => b.ageHours - a.ageHours)
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking = false
  private startedAt = 0

  constructor(private readonly deps: SchedulerDeps) {}

  start() {
    this.startedAt = Date.now()
    // A minute's grace after launch: starting a 90-minute scrape while someone
    // is still logging in is not what they opened the app for.
    setTimeout(() => void this.tick(), 60_000)
    this.timer = setInterval(() => void this.tick(), TICK_MS)

    // Waking from sleep is the single most likely moment for work to be due.
    powerMonitor.on('resume', () => void this.tick())
  }

  /** When the next scheduled check fires, for the window's status line. */
  get nextCheckAt(): number | null {
    if (!this.timer) return null
    const now = Date.now()
    const first = this.startedAt + 60_000
    if (now < first) return first
    return this.startedAt + Math.ceil((now - this.startedAt) / TICK_MS) * TICK_MS
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async tick(): Promise<void> {
    if (this.ticking || this.deps.isPaused()) return
    if (this.deps.runner.busy) return

    // A 90-minute scrape is not something to start on battery, unless the user
    // has said otherwise. Manual runs are always allowed: this only governs the
    // unattended path.
    if (this.deps.skipOnBattery() && powerMonitor.isOnBatteryPower()) return

    this.ticking = true
    try {
      // Free any lease left behind by a run that died without closing its row.
      await this.deps.queries.reapStaleRuns()

      const [sync, ciRuns] = await Promise.all([
        this.deps.queries.getShopSync(),
        this.deps.queries.latestScrapeRuns('ci'),
      ])
      const due = dueShops(sync, this.deps.queries.SHOP_SCHEDULE, ciRuns)

      for (const candidate of due) {
        if (this.deps.isPaused()) break
        await this.deps.execute({ kind: 'scrape', shop: candidate.shop }, 'schedule')
      }

      // Normalize only once the scraping is done, and only if there is anything
      // waiting — it rewrites listings wholesale, so running it for nothing is
      // pure churn.
      const after = await this.deps.queries.getShopSync()
      const pending = after.reduce((n, s) => n + s.pending, 0)
      if (pending > 0 && !this.deps.isPaused()) {
        await this.deps.execute({ kind: 'normalize' }, 'schedule')
      }
    } catch (err) {
      this.deps.notify(
        'Sync check failed',
        err instanceof Error ? err.message : String(err),
      )
    } finally {
      this.ticking = false
    }
  }
}
