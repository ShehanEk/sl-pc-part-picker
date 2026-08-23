import { unstable_cache } from 'next/cache'
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { listings, parts, priceHistory } from '@/db/schema'
import {
  checkGpuAgainstPsu,
  overallStatus,
  requiredPsuWatts,
  type CheckResult,
  type CheckStatus,
  type Gpu,
  type Psu,
} from '@/compat/rules'
import type { Category } from '@/scrapers/types'

/**
 * Read side of the app. Everything here is a plain query plus the deterministic
 * rules — no AI, which only ever runs at ingest.
 */

/**
 * A listing not seen in a scrape for this long is treated as gone.
 *
 * Shops drop products without saying so, and an upsert cannot notice a row that
 * stopped appearing. Filtering on freshness rather than deleting means a single
 * failed scrape run cannot wipe a shop's catalogue — the rows simply age out and
 * come back when scraping recovers.
 */
export const STALE_AFTER_DAYS = 7

/**
 * How long a read is reused before hitting the database again.
 *
 * The scrapers run once nightly, so nothing here changes between runs and a
 * request-per-render would be pure waste — six queries against Neon for every
 * page view, against a free tier metered in compute-hours. Half an hour is far
 * shorter than the data's actual update rate, so it is conservative rather than
 * clever.
 */
const CACHE_SECONDS = 1800

const freshOnly = gte(
  listings.scrapedAt,
  sql`now() - make_interval(days => ${STALE_AFTER_DAYS})`,
)

const money = (v: string | number | null) => (v === null ? null : Number(v))

export type PickerEntry = {
  partId: string
  model: string
  brand: string
  category: Category
  /** Cheapest price you can actually pay today, or null if nowhere has stock. */
  cheapestInStockLkr: number | null
  /** Cheapest listed price regardless of stock, for reference only. */
  cheapestLkr: number
  shopCount: number
  inStockShopCount: number
}

/**
 * Parts local shops carry.
 *
 * Stock matters more than it looks: 52 of 56 graphics cards have an
 * out-of-stock listing as their cheapest, so quoting the lowest price outright
 * advertises a number nobody can pay. Availability is carried through
 * everywhere a price is shown.
 */
export const listPartsForPicker = unstable_cache(
  _listPartsForPicker,
  ['parts-picker'],
  { revalidate: CACHE_SECONDS, tags: ['catalog'] },
)

async function _listPartsForPicker(category?: Category): Promise<PickerEntry[]> {
  const db = getDb()
  const rows = await db
    .select({
      partId: parts.partId,
      model: parts.model,
      brand: parts.brand,
      category: parts.category,
      cheapest: sql<string>`min(${listings.priceLkr})`,
      cheapestInStock: sql<string | null>`min(${listings.priceLkr}) filter (where ${listings.inStock})`,
      shopCount: sql<number>`count(distinct ${listings.shop})::int`,
      inStockShopCount: sql<number>`count(distinct ${listings.shop}) filter (where ${listings.inStock})::int`,
    })
    .from(parts)
    .innerJoin(listings, eq(listings.partId, parts.partId))
    .where(category ? and(eq(parts.category, category), freshOnly) : freshOnly)
    .groupBy(parts.partId, parts.model, parts.brand, parts.category)
    // In-stock parts first, then most widely carried: a card four shops have on
    // the shelf is likelier to be what someone is shopping for than whatever is
    // cheapest in the catalogue.
    .orderBy(
      asc(parts.category),
      desc(sql`count(distinct ${listings.shop}) filter (where ${listings.inStock})`),
      desc(sql`count(distinct ${listings.shop})`),
      asc(sql`min(${listings.priceLkr})`),
    )

  return rows.map((r) => ({
    partId: r.partId,
    model: r.model,
    brand: r.brand,
    category: r.category,
    cheapestLkr: money(r.cheapest)!,
    cheapestInStockLkr: money(r.cheapestInStock),
    shopCount: r.shopCount,
    inStockShopCount: r.inStockShopCount,
  }))
}

export type PartDetail = {
  partId: string
  category: Category
  brand: string
  model: string
  tdpWatts: number | null
  recommendedPsuWatts: number | null
  powerConnector: Gpu['powerConnector']
  vramGb: number | null
  lengthMm: number | null
  ratedWatts: number | null
  efficiencyRating: string | null
  connectors: Psu['connectors']
}

export const getPart = unstable_cache(_getPart, ['part'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _getPart(partId: string): Promise<PartDetail | null> {
  const db = getDb()
  const [row] = await db.select().from(parts).where(eq(parts.partId, partId))
  if (!row) return null
  return {
    partId: row.partId,
    category: row.category,
    brand: row.brand,
    model: row.model,
    tdpWatts: row.tdpWatts,
    recommendedPsuWatts: row.recommendedPsuWatts,
    powerConnector: row.powerConnector,
    vramGb: row.vramGb,
    lengthMm: row.lengthMm,
    ratedWatts: row.ratedWatts,
    efficiencyRating: row.efficiencyRating,
    connectors: row.connectors,
  }
}

export type ShopListing = {
  shop: string
  priceLkr: number
  url: string
  inStock: boolean
  /** ISO string, not a Date: these rows travel through the cache, which does
   *  not round-trip Date objects. */
  scrapedAt: string
}

/** Where a part can be bought: in-stock first, then cheapest. */
export const getShopListings = unstable_cache(_getShopListings, ['shop-listings'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _getShopListings(partId: string): Promise<ShopListing[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.partId, partId), freshOnly))
    .orderBy(desc(listings.inStock), asc(listings.priceLkr))

  return rows.map((r) => ({
    shop: r.shop,
    priceLkr: money(r.priceLkr)!,
    url: r.url,
    inStock: r.inStock,
    scrapedAt: r.scrapedAt.toISOString(),
  }))
}

export type PricePoint = { day: string; lowestLkr: number }

/**
 * Cheapest price per day across all shops — the trend a buyer cares about is
 * "what would this have cost me", not any single shop's number.
 */
export const getPriceSeries = unstable_cache(_getPriceSeries, ['price-series'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _getPriceSeries(partId: string, days = 30): Promise<PricePoint[]> {
  const db = getDb()
  const rows = await db
    .select({
      day: priceHistory.recordedOn,
      lowest: sql<string>`min(${priceHistory.priceLkr})`,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.partId, partId),
        sql`${priceHistory.recordedOn} >= current_date - make_interval(days => ${days})`,
      ),
    )
    .groupBy(priceHistory.recordedOn)
    .orderBy(asc(priceHistory.recordedOn))

  return rows.map((r) => ({ day: r.day, lowestLkr: money(r.lowest)! }))
}

export type PsuOption = {
  partId: string
  model: string
  brand: string
  ratedWatts: number | null
  efficiencyRating: string | null
  cheapestLkr: number
  shop: string
  url: string
  status: CheckStatus
  checks: CheckResult[]
  /** Cheapest option that is not a hard fail. */
  cheapestFit: boolean
}

export type PsuMatches = {
  requiredWatts: number | null
  requiredBasis: string | null
  options: PsuOption[]
  failing: number
}

/**
 * PSUs sold locally, judged against a GPU.
 *
 * Restricted to units actually in stock. Recommending a part nobody can buy
 * defeats the point of a local tracker, and roughly half of all PSU listings
 * are out of stock at any time.
 *
 * Hard failures are dropped rather than shown greyed out: the whole point is to
 * spare the buyer the arithmetic, and a wall of unusable options is the
 * arithmetic in a different shape. The count is still reported so the UI can
 * say how many were filtered.
 */
type PsuCandidate = {
  partId: string
  model: string
  brand: string
  ratedWatts: number | null
  efficiencyRating: string | null
  connectors: Psu['connectors']
  cheapest: string
  shop: string
  url: string
}

/**
 * Every in-stock PSU, before any GPU is considered.
 *
 * Split out and cached on its own because this query is identical whichever
 * card you picked — only the rules applied to it differ, and those are pure
 * functions costing nothing.
 */
const getPsuCandidates = unstable_cache(_getPsuCandidates, ['psu-candidates'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _getPsuCandidates(): Promise<PsuCandidate[]> {
  const db = getDb()
  return db
    .select({
      partId: parts.partId,
      model: parts.model,
      brand: parts.brand,
      ratedWatts: parts.ratedWatts,
      efficiencyRating: parts.efficiencyRating,
      connectors: parts.connectors,
      cheapest: sql<string>`min(${listings.priceLkr})`,
      shop: sql<string>`(array_agg(${listings.shop} order by ${listings.priceLkr}))[1]`,
      url: sql<string>`(array_agg(${listings.url} order by ${listings.priceLkr}))[1]`,
    })
    .from(parts)
    .innerJoin(listings, eq(listings.partId, parts.partId))
    .where(and(eq(parts.category, 'psu'), freshOnly, eq(listings.inStock, true)))
    .groupBy(
      parts.partId,
      parts.model,
      parts.brand,
      parts.ratedWatts,
      parts.efficiencyRating,
      parts.connectors,
    )
    .orderBy(asc(sql`min(${listings.priceLkr})`))
}

export async function getPsuOptionsFor(gpu: PartDetail): Promise<PsuMatches> {
  const rows = await getPsuCandidates()

  const asGpu: Gpu = {
    model: gpu.model,
    tdpWatts: gpu.tdpWatts,
    recommendedPsuWatts: gpu.recommendedPsuWatts,
    powerConnector: gpu.powerConnector,
  }
  const need = requiredPsuWatts(asGpu, null)

  const scored = rows.map((r) => {
    const psu: Psu = {
      model: r.model,
      ratedWatts: r.ratedWatts,
      connectors: r.connectors,
    }
    const checks = checkGpuAgainstPsu(asGpu, psu)
    return {
      partId: r.partId,
      model: r.model,
      brand: r.brand,
      ratedWatts: r.ratedWatts,
      efficiencyRating: r.efficiencyRating,
      cheapestLkr: money(r.cheapest)!,
      shop: r.shop,
      url: r.url,
      status: overallStatus(checks),
      checks,
      cheapestFit: false,
    }
  })

  const usable = scored
    .filter((s) => s.status !== 'fail')
    .sort((a, b) => a.cheapestLkr - b.cheapestLkr)
  if (usable[0]) usable[0].cheapestFit = true

  return {
    requiredWatts: need?.watts ?? null,
    requiredBasis: need?.basis ?? null,
    options: usable,
    failing: scored.length - usable.length,
  }
}

/** Totals for the footer, so the page says how much data it is standing on. */
export const getCatalogStats = unstable_cache(_getCatalogStats, ['catalog-stats'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _getCatalogStats() {
  const db = getDb()
  const [row] = await db
    .select({
      parts: sql<number>`(select count(*) from ${parts})::int`,
      listings: sql<number>`(select count(*) from ${listings} where ${freshOnly})::int`,
      shops: sql<number>`(select count(distinct shop) from ${listings})::int`,
      lastScrape: sql<Date | null>`(select max(scraped_at) from ${listings})`,
    })
    .from(sql`(select 1) as _`)
  return row
}
