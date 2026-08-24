import { unstable_cache } from 'next/cache'
import { and, asc, eq, gte, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { listings, parts } from '@/db/schema'
import {
  BUILD_SLOTS,
  rankCandidates,
  type Build,
  type BuildPart,
  type BuildSlot,
  type CandidateVerdict,
} from '@/compat/build'

/**
 * Read side of the configurator.
 *
 * A candidate is a part *and* a seller, because mixing shops is the point of
 * the product. Every option therefore carries the cheapest in-stock listing for
 * that part, and the shop offering it.
 */

const STALE_AFTER_DAYS = 7
const CACHE_SECONDS = 1800

const fresh = gte(listings.scrapedAt, sql`now() - make_interval(days => ${STALE_AFTER_DAYS})`)

export type PartOffer = BuildPart & {
  /** How many shops list this part at all, in stock or not. */
  shopCount: number
  /** Display-only, not used by any rule. */
  vramGb: number | null
  efficiencyRating: string | null
}

/**
 * Every in-stock part in a category, priced at its cheapest seller.
 *
 * Cached per category rather than per build: the rows are identical whatever
 * the shopper has already chosen, and only the rules applied afterwards differ.
 */
const loadCategory = unstable_cache(_loadCategory, ['build-category'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _loadCategory(category: BuildSlot): Promise<PartOffer[]> {
  const db = getDb()
  const rows = await db
    .select({
      partId: parts.partId,
      category: parts.category,
      brand: parts.brand,
      model: parts.model,
      socket: parts.socket,
      ramType: parts.ramType,
      tdpWatts: parts.tdpWatts,
      recommendedPsuWatts: parts.recommendedPsuWatts,
      powerConnector: parts.powerConnector,
      ramSlots: parts.ramSlots,
      maxRamGb: parts.maxRamGb,
      maxSupportedSpeedMhz: parts.maxSupportedSpeedMhz,
      speedMhz: parts.speedMhz,
      capacityGb: parts.capacityGb,
      modules: parts.modules,
      ratedWatts: parts.ratedWatts,
      efficiencyRating: parts.efficiencyRating,
      vramGb: parts.vramGb,
      connectors: parts.connectors,
      price: sql<string>`min(${listings.priceLkr})`,
      shop: sql<string>`(array_agg(${listings.shop} order by ${listings.priceLkr}))[1]`,
      shopCount: sql<number>`count(distinct ${listings.shop})::int`,
    })
    .from(parts)
    .innerJoin(listings, eq(listings.partId, parts.partId))
    .where(and(eq(parts.category, category), fresh, eq(listings.inStock, true)))
    .groupBy(parts.partId)
    .orderBy(asc(sql`min(${listings.priceLkr})`))

  return rows.map((r) => ({
    partId: r.partId,
    category: r.category as BuildSlot,
    brand: r.brand,
    model: r.model,
    shop: r.shop,
    priceLkr: Number(r.price),
    socket: r.socket,
    ramType: r.ramType,
    tdpWatts: r.tdpWatts,
    recommendedPsuWatts: r.recommendedPsuWatts,
    powerConnector: r.powerConnector,
    ramSlots: r.ramSlots,
    maxRamGb: r.maxRamGb,
    maxSupportedSpeedMhz: r.maxSupportedSpeedMhz,
    speedMhz: r.speedMhz,
    capacityGb: r.capacityGb,
    modules: r.modules,
    ratedWatts: r.ratedWatts,
    connectors: r.connectors,
    shopCount: r.shopCount,
    vramGb: r.vramGb,
    efficiencyRating: r.efficiencyRating,
  }))
}

export type ShopOffer = {
  shop: string
  priceLkr: number
  url: string
  inStock: boolean
}

/** Every seller of one part, so a shopper can take it from someone else. */
export const getOffersForPart = unstable_cache(_getOffersForPart, ['part-offers'], {
  revalidate: CACHE_SECONDS,
  tags: ['catalog'],
})

async function _getOffersForPart(partId: string): Promise<ShopOffer[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.partId, partId), fresh))
    .orderBy(asc(listings.priceLkr))
  return rows.map((r) => ({
    shop: r.shop,
    priceLkr: Number(r.priceLkr),
    url: r.url,
    inStock: r.inStock,
  }))
}

/**
 * A build slot as encoded in the URL: `partId~shop`.
 *
 * The build lives in the address bar so it can be shared and linked, which is
 * how people actually pass a parts list to someone else.
 */
export function encodeSlot(partId: string, shop: string): string {
  return `${partId}~${shop}`
}

function decodeSlot(value: string | undefined): { partId: string; shop: string } | null {
  if (!value) return null
  const i = value.lastIndexOf('~')
  if (i === -1) return { partId: value, shop: '' }
  return { partId: value.slice(0, i), shop: value.slice(i + 1) }
}

/** Rebuild the chosen parts from the URL, priced at the shop the shopper picked. */
export async function hydrateBuild(
  params: Record<string, string | undefined>,
): Promise<Build> {
  const build: Build = {}

  // Only the known slots. The caller hands us the whole query string, which
  // also carries `slot` and `shops` for UI state — reading those as categories
  // sent "slot" to a Postgres enum and crashed the page on every click.
  const slots = BUILD_SLOTS.filter((s) => params[s])

  await Promise.all(
    slots.map(async (slot) => {
      const chosen = decodeSlot(params[slot])
      if (!chosen) return
      const catalogue = await loadCategory(slot)
      const part = catalogue.find((p) => p.partId === chosen.partId)
      if (!part) return

      // Honour the shop in the URL even when it is not the cheapest, since the
      // shopper chose it deliberately.
      if (chosen.shop && chosen.shop !== part.shop) {
        const offers = await getOffersForPart(part.partId)
        const picked = offers.find((o) => o.shop === chosen.shop)
        if (picked) {
          build[slot] = { ...part, shop: picked.shop, priceLkr: picked.priceLkr }
          return
        }
      }
      build[slot] = part
    }),
  )

  return build
}

export type SlotOptions = {
  slot: BuildSlot
  fitting: CandidateVerdict<PartOffer>[]
  blocked: CandidateVerdict<PartOffer>[]
  total: number
}

/** Options for one slot, judged against everything already chosen. */
export async function getSlotOptions(build: Build, slot: BuildSlot): Promise<SlotOptions> {
  const catalogue = await loadCategory(slot)
  const ranked = rankCandidates(build, slot, catalogue)
  return {
    slot,
    fitting: ranked.filter((r) => r.status !== 'fail'),
    blocked: ranked.filter((r) => r.status === 'fail'),
    total: ranked.length,
  }
}

/** How many in-stock options exist per slot, for the overview. */
export const getSlotCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const db = getDb()
    const rows = await db
      .select({
        category: parts.category,
        n: sql<number>`count(distinct ${parts.partId})::int`,
      })
      .from(parts)
      .innerJoin(listings, eq(listings.partId, parts.partId))
      .where(and(fresh, eq(listings.inStock, true)))
      .groupBy(parts.category)
    return Object.fromEntries(rows.map((r) => [r.category, r.n]))
  },
  ['slot-counts'],
  { revalidate: CACHE_SECONDS, tags: ['catalog'] },
)
