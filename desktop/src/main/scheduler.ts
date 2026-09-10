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
 * - A shop CI scraped last night is fresh, so the desktop leaves it alone. The
 *   "CI covers these, I cover those" split falls out of the data instead of
 *   being a list someone maintains — and it corrects itself the day gamestreet
 *   starts working from CI again, or the day winsoft stops.
 * - Catch-up is free. There is no missed firing to reconstruct, only staleness
 *   that is still there when the machine wakes up.
 * - A tick that drifts, or is skipped for eight hours of sleep, is harmless.
 */

/**
 * How late CI is allowed to be before the desktop steps in.
 *
 * A fixed staleness threshold does not work here, and testing against live data
 * is what showed it: a healthy shop's age sweeps from 0h to 24h across the day,
 * so *any* threshold below 24 is crossed for the last few hours before the next
 * CI run — and the desktop would scrape a retailer that CI was about to scrape
 * anyway. Comparing against the shop's own last scheduled slot has no such
 * window: if a row landed after the slot, CI has it.
 */
const GRACE_HOURS = 2

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
  schedule: Record<string, { cronUtc: string }>,
  now = new Date(),
): Candidate[] {
  const out: Candidate[] = []

  for (const row of sync) {
    const age = row.lastScrapeAgeHours

    if (!Number.isFinite(age)) {
      out.push({ shop: row.shop, ageHours: Infinity, reason: 'never scraped' })
      continue
    }

    const cron = schedule[row.shop]?.cronUtc
    if (!cron) {
      if (age > UNSCHEDULED_STALE_HOURS) {
        out.push({ shop: row.shop, ageHours: age, reason: `${Math.round(age)}h stale` })
      }
      continue
    }

    const sinceSlot = hoursSinceExpectedRun(cron, now)

    // Too soon after the slot to judge: a nanotek run takes up to 90 minutes,
    // so a slot that passed a few minutes ago tells us nothing yet. Stepping in
    // here is how the desktop would end up scraping alongside a live CI run.
    if (sinceSlot <= GRACE_HOURS) continue

    // A row newer than the slot means the slot was served — by CI or by us.
    // Only a row older than its own slot is a genuinely missed night.
    if (age <= sinceSlot) continue

    const missed = Math.floor(age / 24)
    out.push({
      shop: row.shop,
      ageHours: age,
      reason: missed >= 1 ? `missed ${missed} night${missed > 1 ? 's' : ''}` : 'missed its slot',
    })
  }

  return out.sort((a, b) => b.ageHours - a.ageHours)
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking = false

  constructor(private readonly deps: SchedulerDeps) {}

  start() {
    // A minute's grace after launch: starting a 90-minute scrape while someone
    // is still logging in is not what they opened the app for.
    setTimeout(() => void this.tick(), 60_000)
    this.timer = setInterval(() => void this.tick(), TICK_MS)

    // Waking from sleep is the single most likely moment for work to be due.
    powerMonitor.on('resume', () => void this.tick())
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async tick(): Promise<void> {
    if (this.ticking || this.deps.isPaused()) return
    if (this.deps.runner.busy) return

    // A 90-minute scrape is not something to start on battery. Manual runs are
    // still allowed — this only governs the unattended path.
    if (powerMonitor.isOnBatteryPower()) return

    this.ticking = true
    try {
      // Free any lease left behind by a run that died without closing its row.
      await this.deps.queries.reapStaleRuns()

      const sync = await this.deps.queries.getShopSync()
      const due = dueShops(sync, this.deps.queries.SHOP_SCHEDULE)

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
