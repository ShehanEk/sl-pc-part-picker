import { unstable_cache } from 'next/cache'
import { asc, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { listings, parts, priceHistory } from '@/db/schema'
import { BUILD_SLOTS, type BuildPart, type BuildSlot } from '@/compat/build'

/**
 * The catalogue as the indexable pages need it.
 *
 * Deliberately not `loadCatalogue()`. That one exists to feed the configurator
 * and drops anything with no in-stock offer, which is right for a build tool and
 * wrong for a page that search engines have indexed: a card selling out
 * everywhere would take its URL down with it, and a URL that 404s loses whatever
 * ranking it had. Here every part with a listing keeps its page, and stock is
 * reported rather than used as a filter.
 */

const CACHE_SECONDS = 1800

/** How old a listing may be before its price is presented as last-seen. */
export const STALE_AFTER_DAYS = 7

export type SeoOffer = {
  shop: string
  priceLkr: number
  url: string
  inStock: boolean
  /** ISO date. Used to caption a price we can no longer confirm. */
  seenOn: string
  stale: boolean
}

export type SeoPart = BuildPart & {
  vramGb: number | null
  efficiencyRating: string | null
  offers: SeoOffer[]
  /** Cheapest in-stock price, or null when nobody has it. */
  bestLkr: number | null
  lowLkr: number
  highLkr: number
  inStockShops: number
  updatedOn: string
}

export type Directory = Record<BuildSlot, SeoPart[]>

export const loadDirectory = unstable_cache(_loadDirectory, ['seo-directory'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _loadDirectory(): Promise<Directory> {
  const db = getDb()
  const [allParts, allListings] = await Promise.all([
    db.select().from(parts),
    db.select().from(listings),
  ])

  const staleBefore = Date.now() - STALE_AFTER_DAYS * 86_400_000

  const byPart = new Map<string, SeoOffer[]>()
  for (const l of allListings) {
    const seen = l.scrapedAt instanceof Date ? l.scrapedAt : new Date(l.scrapedAt)
    const offer: SeoOffer = {
      shop: l.shop,
      priceLkr: Number(l.priceLkr),
      url: l.url,
      inStock: l.inStock,
      seenOn: seen.toISOString().slice(0, 10),
      stale: seen.getTime() < staleBefore,
    }
    const existing = byPart.get(l.partId)
    if (existing) existing.push(offer)
    else byPart.set(l.partId, [offer])
  }

  const out = Object.fromEntries(BUILD_SLOTS.map((s) => [s, [] as SeoPart[]])) as Directory

  for (const p of allParts) {
    const slot = p.category as BuildSlot
    if (!BUILD_SLOTS.includes(slot)) continue

    const offers = byPart.get(p.partId)
    if (!offers || offers.length === 0) continue

    // Buyable first, then cheapest. A headline price you cannot pay is worse
    // than a higher one you can.
    offers.sort(
      (a, b) =>
        Number(b.inStock) - Number(a.inStock) ||
        Number(a.stale) - Number(b.stale) ||
        a.priceLkr - b.priceLkr,
    )

    const prices = offers.map((o) => o.priceLkr)
    const buyable = offers.filter((o) => o.inStock && !o.stale)

    out[slot].push({
      partId: p.partId,
      category: slot,
      brand: p.brand,
      model: p.model,
      shop: offers[0].shop,
      priceLkr: offers[0].priceLkr,
      socket: p.socket,
      ramType: p.ramType,
      tdpWatts: p.tdpWatts,
      recommendedPsuWatts: p.recommendedPsuWatts,
      powerConnector: p.powerConnector,
      ramSlots: p.ramSlots,
      maxRamGb: p.maxRamGb,
      maxSupportedSpeedMhz: p.maxSupportedSpeedMhz,
      speedMhz: p.speedMhz,
      capacityGb: p.capacityGb,
      modules: p.modules,
      ratedWatts: p.ratedWatts,
      storageInterface: p.storageInterface,
      formFactor: p.formFactor,
      connectors: p.connectors,
      vramGb: p.vramGb,
      efficiencyRating: p.efficiencyRating,
      offers,
      bestLkr: buyable.length ? Math.min(...buyable.map((o) => o.priceLkr)) : null,
      lowLkr: Math.min(...prices),
      highLkr: Math.max(...prices),
      inStockShops: buyable.length,
      updatedOn: offers.map((o) => o.seenOn).sort().at(-1)!,
    })
  }

  for (const slot of BUILD_SLOTS) {
    out[slot].sort(
      (a, b) =>
        Number(b.inStockShops > 0) - Number(a.inStockShops > 0) ||
        (a.bestLkr ?? a.lowLkr) - (b.bestLkr ?? b.lowLkr),
    )
  }

  return out
}

export type PricePoint = { day: string; lowestLkr: number }

/**
 * Daily lows for every part in one query, rather than one query per page.
 *
 * There are ~1,000 part pages. Fetching a series per page would mean ~1,000
 * round trips per build; the whole table is small enough to hand back at once.
 */
export const loadPriceIndex = unstable_cache(_loadPriceIndex, ['seo-price-index'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _loadPriceIndex(days = 90): Promise<Record<string, PricePoint[]>> {
  const db = getDb()
  const rows = await db
    .select({
      partId: priceHistory.partId,
      day: priceHistory.recordedOn,
      lowest: sql<string>`min(${priceHistory.priceLkr})`,
    })
    .from(priceHistory)
    .where(sql`${priceHistory.recordedOn} >= current_date - make_interval(days => ${days})`)
    .groupBy(priceHistory.partId, priceHistory.recordedOn)
    .orderBy(asc(priceHistory.partId), asc(priceHistory.recordedOn))

  const out: Record<string, PricePoint[]> = {}
  for (const r of rows) {
    ;(out[r.partId] ??= []).push({ day: String(r.day), lowestLkr: Number(r.lowest) })
  }
  return out
}

/** Flat list of every indexable part, for the sitemap. */
export async function listIndexableParts(): Promise<
  { category: BuildSlot; partId: string; updatedOn: string }[]
> {
  const directory = await loadDirectory()
  return BUILD_SLOTS.flatMap((slot) =>
    directory[slot].map((p) => ({
      category: slot,
      partId: p.partId,
      updatedOn: p.updatedOn,
    })),
  )
}
