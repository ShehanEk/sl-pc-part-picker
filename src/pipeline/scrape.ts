import { getDb } from '@/db'
import { rawListings } from '@/db/schema'
import { getScraper, shopKeys } from '@/scrapers'
import type { Category, ScrapedRow } from '@/scrapers/types'

/**
 * Stage 1+2 of the pipeline: scrape a retailer and land the rows in
 * `raw_listings` exactly as scraped.
 *
 * Nothing here maps to canonical parts, and nothing writes to `listings` or
 * `price_history` — that is the normalizer's job. Keeping the two apart is what
 * lets ingest be reprocessed after a normalization bug without re-scraping.
 */

export type RunOptions = {
  categories?: Category[]
  maxPages?: number
  maxProducts?: number
  /** Scrape and report, but write nothing. */
  dryRun?: boolean
  log?: (msg: string) => void
}

export type RunResult = {
  shop: string
  scraped: number
  inserted: number
  withPrice: number
  durationMs: number
}

export async function landRawRows(rows: ScrapedRow[]): Promise<number> {
  if (rows.length === 0) return 0

  const values = rows.map((r) => ({
    shop: r.shop,
    sourceUrl: r.sourceUrl,
    rawTitle: r.rawTitle,
    rawPriceText: r.rawPriceText,
    rawPayload: r.payload,
  }))

  // Chunked to stay under the parameter limit on wide payloads.
  const db = getDb()
  const CHUNK = 100
  let inserted = 0
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK)
    await db.insert(rawListings).values(chunk)
    inserted += chunk.length
  }
  return inserted
}

/** A title that is blank, tiny, or just a price means the selector broke. */
function looksLikeBadTitle(title: string): boolean {
  const t = title.trim()
  return t.length < 8 || /^(rs\.?|lkr)?\s*[\d,.]+\s*(lkr|rs\.?)?$/i.test(t)
}

/**
 * Guard against silent breakage. These sites change markup without notice, and
 * a selector that starts matching the wrong node yields rows that look fine by
 * count but are useless — an earlier bug had every nanotek title come back as
 * the cart total ("0 LKR"). Better to fail the run than to land garbage.
 */
function assertPlausible(shop: string, rows: ScrapedRow[], withPrice: number) {
  // Zero rows is never normal for a shop we track — every one of them has
  // hundreds of products. It means we were blocked, or the site moved.
  //
  // This used to return quietly, so a run that scraped nothing exited 0 and the
  // nightly job reported success. gamestreet.lk began answering the CI runner
  // with 403 on every category and the workflow still went green, which is the
  // worst possible outcome: the data silently stops arriving and nothing says so.
  if (rows.length === 0) {
    throw new Error(
      `[${shop}] returned no rows at all — the shop is likely blocking us, or its ` +
        `page structure changed. Check the log above for HTTP status codes.`,
    )
  }

  if (withPrice === 0) {
    throw new Error(
      `[${shop}] scraped ${rows.length} rows but none had a price — ` +
        `the site layout has probably changed`,
    )
  }

  const bad = rows.filter((r) => looksLikeBadTitle(r.rawTitle)).length
  if (bad / rows.length > 0.5) {
    throw new Error(
      `[${shop}] ${bad}/${rows.length} rows have implausible titles ` +
        `(e.g. "${rows.find((r) => looksLikeBadTitle(r.rawTitle))?.rawTitle}") — ` +
        `the title selector has probably broken`,
    )
  }
}

export async function runScraper(
  shop: string,
  opts: RunOptions = {},
): Promise<RunResult> {
  const log = opts.log ?? ((m: string) => console.log(m))
  const scraper = getScraper(shop)
  const startedAt = Date.now()

  log(`[${shop}] starting`)
  const rows = await scraper.scrape({
    categories: opts.categories,
    maxPages: opts.maxPages,
    maxProducts: opts.maxProducts,
    log,
  })

  // Rows are landed verbatim, zeros included (some retailers use 0 for
  // "call for price"), but a zero must not count as a real price when deciding
  // whether the scraper still works.
  const withPrice = rows.filter((r) => (r.payload.priceLkr ?? 0) > 0).length
  assertPlausible(shop, rows, withPrice)

  const inserted = opts.dryRun ? 0 : await landRawRows(rows)

  const result: RunResult = {
    shop,
    scraped: rows.length,
    inserted,
    withPrice,
    durationMs: Date.now() - startedAt,
  }

  log(
    `[${shop}] scraped=${result.scraped} withPrice=${result.withPrice} ` +
      `inserted=${result.inserted}${opts.dryRun ? ' (dry run)' : ''} ` +
      `in ${(result.durationMs / 1000).toFixed(1)}s`,
  )

  return result
}

/** Run several retailers in sequence, collecting failures rather than aborting. */
export async function runScrapers(
  shops: string[],
  opts: RunOptions = {},
): Promise<{ results: RunResult[]; failures: { shop: string; error: string }[] }> {
  const results: RunResult[] = []
  const failures: { shop: string; error: string }[] = []

  for (const shop of shops) {
    try {
      results.push(await runScraper(shop, opts))
    } catch (err) {
      failures.push({ shop, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { results, failures }
}

export { shopKeys }
