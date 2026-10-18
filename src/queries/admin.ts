import { sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { SHOP_SCHEDULE, hoursSinceExpectedRun } from '@/lib/site'

/**
 * Sync-health reads for the desktop app's monitor (desktop/src/main/admin-queries.ts).
 *
 * **Deliberately uncached.** Every other query module wraps its reads in
 * `unstable_cache` with a 30-minute revalidate, which is right for a catalogue
 * that changes once a night. It is exactly wrong here: a monitor that can be
 * half an hour stale cannot tell you the pipeline stopped half an hour ago.
 * These run on every call.
 */

export type ShopSync = {
  shop: string
  lastScrape: string | null
  /** Hours since the last landed row; Infinity when a shop has never landed one. */
  lastScrapeAgeHours: number
  /** Green: landed since its last scheduled run. Amber: one run missed. Red: two or more. */
  tone: 'ok' | 'warn' | 'bad'
  scheduleLabel: string | null
  rowsLast24h: number
  pending: number
  lastListingWrite: string | null
  listings: number
  inStock: number
  lastPricePoint: string | null
}

/**
 * Reads the clock, so it lives here rather than in a component — the React
 * compiler treats `Date.now()` in render as impure, and it is right to: a page
 * whose output depends on when it ran cannot be memoised.
 */
export async function getShopSync(): Promise<ShopSync[]> {
  const db = getDb()
  const now = Date.now()

  const rows = (
    await db.execute(sql`
      with raw as (
        select shop,
               max(scraped_at) as last_scrape,
               count(*) filter (where scraped_at > now() - interval '1 day')::int as rows_24h,
               count(*) filter (where normalized_at is null)::int as pending
        from raw_listings group by shop
      ),
      live as (
        select shop,
               max(scraped_at) as last_write,
               count(*)::int as listings,
               count(*) filter (where in_stock)::int as in_stock
        from listings group by shop
      ),
      hist as (
        select shop, max(recorded_on)::text as last_point
        from price_history group by shop
      )
      select coalesce(raw.shop, live.shop, hist.shop) as shop,
             raw.last_scrape, raw.rows_24h, raw.pending,
             live.last_write, live.listings, live.in_stock,
             hist.last_point
      from raw
      full outer join live on live.shop = raw.shop
      full outer join hist on hist.shop = coalesce(raw.shop, live.shop)
      order by 1
    `)
  ).rows as Record<string, unknown>[]

  return rows.map((r) => {
    const shop = String(r.shop)
    const lastScrape = r.last_scrape ? new Date(r.last_scrape as string) : null
    const ageHours = lastScrape ? (now - lastScrape.getTime()) / 3_600_000 : Infinity

    const schedule = SHOP_SCHEDULE[shop]
    const sinceExpected = schedule
      ? hoursSinceExpectedRun(schedule.cronUtc, new Date(now))
      : null

    const tone: ShopSync['tone'] =
      sinceExpected === null
        ? ageHours <= 48
          ? 'ok'
          : 'bad'
        : ageHours <= sinceExpected
          ? 'ok'
          : ageHours <= sinceExpected + 24
            ? 'warn'
            : 'bad'

    return {
      shop,
      lastScrape: lastScrape?.toISOString() ?? null,
      lastScrapeAgeHours: ageHours,
      tone,
      scheduleLabel: schedule?.localLabel ?? null,
      rowsLast24h: Number(r.rows_24h ?? 0),
      pending: Number(r.pending ?? 0),
      lastListingWrite: r.last_write ? new Date(r.last_write as string).toISOString() : null,
      listings: Number(r.listings ?? 0),
      inStock: Number(r.in_stock ?? 0),
      lastPricePoint: (r.last_point as string) ?? null,
    }
  })
}

export type CategorySummary = {
  category: BuildSlot
  parts: number
  listings: number
  inStock: number
  shops: number
  cheapestLkr: number | null
  dearestLkr: number | null
  overrides: number
}

export async function getCatalogSummary(): Promise<{
  categories: CategorySummary[]
  totals: {
    parts: number
    listings: number
    shops: number
    rawRows: number
    pricePoints: number
    historyDays: number
    overrides: number
    orphanParts: number
    staleListings: number
  }
}> {
  const db = getDb()

  const cats = (
    await db.execute(sql`
      select p.category,
             count(distinct p.part_id)::int as parts,
             count(l.id)::int as listings,
             count(l.id) filter (where l.in_stock)::int as in_stock,
             count(distinct l.shop)::int as shops,
             min(l.price_lkr) filter (where l.in_stock) as cheapest,
             max(l.price_lkr) filter (where l.in_stock) as dearest,
             count(distinct o.part_id)::int as overrides
      from parts p
      left join listings l on l.part_id = p.part_id
      left join part_overrides o on o.part_id = p.part_id
      group by p.category
    `)
  ).rows as Record<string, unknown>[]

  const byCategory = new Map(cats.map((c) => [String(c.category), c]))

  const [totals] = (
    await db.execute(sql`
      select (select count(*)::int from parts) as parts,
             (select count(*)::int from listings) as listings,
             (select count(distinct shop)::int from listings) as shops,
             (select count(*)::int from raw_listings) as raw_rows,
             (select count(*)::int from price_history) as price_points,
             (select count(distinct recorded_on)::int from price_history) as history_days,
             (select count(*)::int from part_overrides) as overrides,
             (select count(*)::int from parts p
                where not exists (select 1 from listings l where l.part_id = p.part_id)) as orphan_parts,
             (select count(*)::int from listings
                where scraped_at < now() - interval '7 days') as stale_listings
    `)
  ).rows as Record<string, number>[]

  return {
    categories: BUILD_SLOTS.map((category) => {
      const row = byCategory.get(category)
      return {
        category,
        parts: Number(row?.parts ?? 0),
        listings: Number(row?.listings ?? 0),
        inStock: Number(row?.in_stock ?? 0),
        shops: Number(row?.shops ?? 0),
        cheapestLkr: row?.cheapest != null ? Number(row.cheapest) : null,
        dearestLkr: row?.dearest != null ? Number(row.dearest) : null,
        overrides: Number(row?.overrides ?? 0),
      }
    }).sort((a, b) => b.parts - a.parts),
    totals: {
      parts: Number(totals?.parts ?? 0),
      listings: Number(totals?.listings ?? 0),
      shops: Number(totals?.shops ?? 0),
      rawRows: Number(totals?.raw_rows ?? 0),
      pricePoints: Number(totals?.price_points ?? 0),
      historyDays: Number(totals?.history_days ?? 0),
      overrides: Number(totals?.overrides ?? 0),
      orphanParts: Number(totals?.orphan_parts ?? 0),
      staleListings: Number(totals?.stale_listings ?? 0),
    },
  }
}
