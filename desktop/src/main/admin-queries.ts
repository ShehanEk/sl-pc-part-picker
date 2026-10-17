/**
 * The read surface the main process uses, bundled separately.
 *
 * Kept out of `main.cjs` and `require`d lazily, because `getDb()` caches a Neon
 * client on first use and reads `DATABASE_URL` at that moment. Loading it only
 * after credentials have been pulled out of encrypted storage is what makes the
 * ordering correct by construction rather than by remembering.
 *
 * These are the same functions the web admin dashboard uses. `src/queries/admin.ts`
 * is deliberately uncached — right for a monitor, and it also means there is no
 * Next.js `unstable_cache` in the closure to break outside Next.
 */

export { getShopSync, getCatalogSummary } from '@/queries/admin'
export type { ShopSync, CategorySummary } from '@/queries/admin'

export {
  finishRun,
  latestScrapeRuns,
  reapStaleRuns,
  recentRuns,
  startRun,
  RunInProgressError,
} from '@/pipeline/runs'
export type { RunHandle } from '@/pipeline/runs'

export { SHOP_SCHEDULE, TRACKED_SHOPS } from '@/lib/site'
export { shopKeys } from '@/scrapers'
