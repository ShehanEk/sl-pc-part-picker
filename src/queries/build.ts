import { unstable_cache } from 'next/cache'
import { and, eq, gte, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { listings, parts } from '@/db/schema'
import { BUILD_SLOTS, type BuildPart, type BuildSlot } from '@/compat/build'

/**
 * Catalogue for the configurator.
 *
 * The whole thing is loaded once and handed to the client, because the build is
 * assembled there: every list is a filter over parts the browser already holds,
 * so choosing something is instant instead of a round trip. The compatibility
 * rules are pure functions and run equally well on either side.
 *
 * Each part carries every shop selling it, so switching seller needs no fetch.
 */

const STALE_AFTER_DAYS = 7
const CACHE_SECONDS = 1800

export type ShopOffer = {
  shop: string
  priceLkr: number
  url: string
  inStock: boolean
}

export type PartOffer = BuildPart & {
  /** Every seller, cheapest first. In-stock ones come first. */
  offers: ShopOffer[]
  /** Display only, never used by a rule. */
  vramGb: number | null
  efficiencyRating: string | null
}

export type Catalogue = Record<BuildSlot, PartOffer[]>

export const loadCatalogue = unstable_cache(_loadCatalogue, ['configurator-catalogue'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _loadCatalogue(): Promise<Catalogue> {
  const db = getDb()

  const [allParts, allListings] = await Promise.all([
    db.select().from(parts),
    db
      .select()
      .from(listings)
      .where(gte(listings.scrapedAt, sql`now() - make_interval(days => ${STALE_AFTER_DAYS})`)),
  ])

  const byPart = new Map<string, ShopOffer[]>()
  for (const l of allListings) {
    const offer: ShopOffer = {
      shop: l.shop,
      priceLkr: Number(l.priceLkr),
      url: l.url,
      inStock: l.inStock,
    }
    const existing = byPart.get(l.partId)
    if (existing) existing.push(offer)
    else byPart.set(l.partId, [offer])
  }

  const empty: Catalogue = { cpu: [], motherboard: [], ram: [], gpu: [], psu: [] }

  for (const p of allParts) {
    if (!BUILD_SLOTS.includes(p.category as BuildSlot)) continue
    const offers = byPart.get(p.partId)
    if (!offers) continue

    // In stock first, then cheapest — the headline price has to be one you can
    // actually pay, and most parts here have an out-of-stock listing underneath.
    offers.sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.priceLkr - b.priceLkr)
    const buyable = offers.find((o) => o.inStock)
    if (!buyable) continue

    empty[p.category as BuildSlot].push({
      partId: p.partId,
      category: p.category as BuildSlot,
      brand: p.brand,
      model: p.model,
      shop: buyable.shop,
      priceLkr: buyable.priceLkr,
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
      connectors: p.connectors,
      vramGb: p.vramGb,
      efficiencyRating: p.efficiencyRating,
      offers,
    })
  }

  for (const slot of BUILD_SLOTS) {
    empty[slot].sort((a, b) => (a.priceLkr ?? 0) - (b.priceLkr ?? 0))
  }

  return empty
}

/** Totals for the footer. */
export const getCatalogStats = unstable_cache(
  async () => {
    const db = getDb()
    const [row] = await db
      .select({
        parts: sql<number>`(select count(*) from ${parts})::int`,
        listings: sql<number>`(select count(*) from ${listings})::int`,
        shops: sql<number>`(select count(distinct shop) from ${listings})::int`,
        lastScrape: sql<string | null>`(select max(scraped_at)::text from ${listings})`,
      })
      .from(sql`(select 1) as _`)
    return row
  },
  ['configurator-stats'],
  { revalidate: CACHE_SECONDS, tags: ['catalog'] },
)

export { and, eq }
