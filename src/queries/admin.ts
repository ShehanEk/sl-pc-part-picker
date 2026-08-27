import { eq, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { partOverrides, parts } from '@/db/schema'
import { gapsForPart } from '@/catalog/gaps'
import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { SHOP_SCHEDULE, hoursSinceExpectedRun } from '@/lib/site'

/**
 * Reads for the admin dashboard.
 *
 * **Deliberately uncached.** Every other query module wraps its reads in
 * `unstable_cache` with a 30-minute revalidate, which is right for a catalogue
 * that changes once a night. It is exactly wrong here: a monitoring page that
 * can be half an hour stale cannot tell you the pipeline stopped half an hour
 * ago. These run on every request.
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

export type GapRow = {
  partId: string
  category: BuildSlot
  brand: string
  model: string
  shops: number
  inStockShops: number
  gaps: { field: string; label: string; unblocks?: string }[]
  hasOverride: boolean
}

/**
 * Parts with spec fields a compatibility rule needs, ranked by how much filling
 * them would matter.
 *
 * ~1,400 cells are empty. A flat list of them is not a feature — it is a list
 * nobody finishes. Ordering by how many shops actually stock the part puts the
 * few dozen that appear in real builds at the top, which is the same reasoning
 * `applyCuratedSpecs` uses for its own uncovered report.
 */
export async function listGaps(
  category?: BuildSlot,
  limit = 60,
): Promise<{ rows: GapRow[]; totalParts: number; totalCells: number }> {
  const db = getDb()

  const all = await db
    .select()
    .from(parts)
    .where(category ? eq(parts.category, category) : sql`true`)

  const counts = (
    await db.execute(sql`
      select part_id,
             count(distinct shop)::int as shops,
             count(distinct shop) filter (where in_stock)::int as in_stock_shops
      from listings group by part_id
    `)
  ).rows as { part_id: string; shops: number; in_stock_shops: number }[]
  const byPart = new Map(counts.map((c) => [c.part_id, c]))

  const overridden = new Set(
    (await db.select({ partId: partOverrides.partId }).from(partOverrides)).map((o) => o.partId),
  )

  const rows: GapRow[] = []
  let totalCells = 0

  for (const part of all) {
    const gaps = gapsForPart(part)
    if (gaps.length === 0) continue
    totalCells += gaps.length
    const c = byPart.get(part.partId)
    rows.push({
      partId: part.partId,
      category: part.category as BuildSlot,
      brand: part.brand,
      model: part.model,
      shops: c?.shops ?? 0,
      inStockShops: c?.in_stock_shops ?? 0,
      gaps,
      hasOverride: overridden.has(part.partId),
    })
  }

  rows.sort(
    (a, b) =>
      b.inStockShops - a.inStockShops ||
      b.shops - a.shops ||
      a.model.localeCompare(b.model),
  )

  return { rows: rows.slice(0, limit), totalParts: rows.length, totalCells }
}

export type EvidenceRow = {
  shop: string
  url: string
  title: string
  specs: Record<string, string>
}

/**
 * Spec tables the scrapers already landed but the normalizer never reads.
 *
 * winsoft publishes Socket Type and GPU VRAM as JSON-LD, pcbuilders ships a
 * MANUFACTURER/MODEL/RAM-SIZE attribute table on every product, and the Tyno
 * sites carry manufacturer tables. All of it sits in `raw_listings.raw_payload`
 * unused. Putting it next to the empty field turns "go and look this up on the
 * vendor's site" into "read the value already in your database", which is also
 * the project's rule about citing rather than recalling.
 *
 * There is no part_id on raw_listings — resolution happens in memory and is
 * discarded — but `listings.url` is copied from `raw_listings.source_url`, so
 * that join is exact for the rows that won the per-(part, shop) dedupe.
 */
export async function getEvidenceFor(partId: string): Promise<EvidenceRow[]> {
  const rows = (
    await getDb().execute(sql`
      select r.shop, r.source_url, r.raw_title, r.raw_payload
      from raw_listings r
      where r.source_url in (select url from listings where part_id = ${partId})
      order by r.scraped_at desc
      limit 12
    `)
  ).rows as Record<string, unknown>[]

  const seen = new Set<string>()
  const out: EvidenceRow[] = []
  for (const r of rows) {
    const shop = String(r.shop)
    if (seen.has(shop)) continue
    seen.add(shop)
    const payload = (r.raw_payload ?? {}) as Record<string, unknown>
    const specs = (payload.specs ?? {}) as Record<string, string>
    out.push({
      shop,
      url: String(r.source_url),
      title: String(r.raw_title),
      specs: typeof specs === 'object' && specs !== null ? specs : {},
    })
  }
  return out
}

export async function getPartForEdit(partId: string) {
  const db = getDb()
  const part = (await db.select().from(parts).where(eq(parts.partId, partId)))[0]
  if (!part) return null

  const override =
    (await db.select().from(partOverrides).where(eq(partOverrides.partId, partId)))[0] ?? null

  const offers = (
    await db.execute(sql`
      select shop, price_lkr, url, in_stock, scraped_at
      from listings where part_id = ${partId} order by in_stock desc, price_lkr asc
    `)
  ).rows as Record<string, unknown>[]

  return {
    part,
    override,
    offers: offers.map((o) => ({
      shop: String(o.shop),
      priceLkr: Number(o.price_lkr),
      url: String(o.url),
      inStock: Boolean(o.in_stock),
    })),
  }
}
