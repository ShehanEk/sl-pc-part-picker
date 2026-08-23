import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { applyCuratedSpecs } from '@/catalog/apply'
import { canonicalPartId, CURATED_BY_ID } from '@/catalog/gpu-specs'
import { getDb } from '@/db'
import { listings, parts, priceHistory, rawListings } from '@/db/schema'
import type { NewPart } from '@/db/schema'
import { aiAvailable, matchTitleToPart, type Candidate } from '@/normalize/ai'
import { extractIdentity, type Identity } from '@/normalize/extract'
import type { Category } from '@/scrapers/types'

/**
 * Stages 3+4: read unprocessed rows from `raw_listings`, resolve each to a
 * canonical `part_id`, then write `listings` and append to `price_history`.
 *
 * Ordering matters here. Deterministic extraction runs first and settles the
 * large majority of rows for free; the model is only asked about what is left.
 * That keeps ingest cheap, but more importantly it keeps it predictable — the
 * same title always yields the same part_id.
 */

export type NormalizeOptions = {
  /** Process at most this many raw rows. */
  limit?: number
  /** Re-process rows already marked normalized. */
  redo?: boolean
  /** Skip the model entirely, even when a key is configured. */
  noAi?: boolean
  /** Resolve and report, but write nothing. */
  dryRun?: boolean
  log?: (msg: string) => void
}

export type NormalizeResult = {
  considered: number
  matchedDeterministic: number
  matchedByAi: number
  unmatched: number
  partsCreated: number
  listingsWritten: number
  historyRows: number
  skippedNoPrice: number
}

/** Specs the retailer published on the page, worth more than anything inferred. */
type ObservedSpecs = Record<string, string>

/**
 * Below this, a "price" is a placeholder rather than a price. Retailers use 0
 * and 1 for call-for-price and discontinued items — chamacomputers.lk had seven
 * listings at exactly 1.00 LKR, which would otherwise have won every
 * cheapest-price comparison they appeared in. The cheapest genuine part in the
 * corpus is a 230W PSU at 4,500 LKR, so this floor has plenty of clearance.
 */
const MIN_PLAUSIBLE_PRICE_LKR = 1000

/** "750W" → 750 */
function parseWatts(value: string | undefined): number | null {
  if (!value) return null
  const m = value.match(/(\d{2,4})\s*w/i)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * "249 x 126 x 50.6 mm" → 249.
 *
 * Some spec tables concatenate the metric and imperial forms with no separator
 * ("203 x 120.2 x 40 mm7.99 x 4.73 x 1.58 inches"), so this reads only the
 * first number and ignores the rest.
 */
function parseLengthMm(value: string | undefined): number | null {
  if (!value) return null
  const m = value.match(/(\d{2,4}(?:\.\d+)?)\s*x/i)
  const n = m ? Math.round(Number(m[1])) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * "1 x 16-pin" → 12v-2x6, "2 x 8-pin" → 2x8pin.
 *
 * Only maps forms actually seen in the corpus; anything else returns null
 * rather than a guess, because this feeds a hard pass/fail compatibility rule.
 */
function parsePowerConnector(
  value: string | undefined,
): '8pin' | '2x8pin' | '12vhpwr' | '12v-2x6' | null {
  if (!value) return null
  const v = value.toLowerCase()
  if (/12vhpwr/.test(v)) return '12vhpwr'
  if (/16[\s-]*pin|12v[\s-]*2x6/.test(v)) return '12v-2x6'
  const m = v.match(/(\d)\s*x\s*8[\s-]*pin/)
  if (m) return Number(m[1]) >= 2 ? '2x8pin' : '8pin'
  if (/8[\s-]*pin/.test(v)) return '8pin'
  return null
}

/** Build the row for a newly discovered canonical part. */
function toNewPart(identity: Identity, specs: ObservedSpecs | undefined): NewPart {
  if (identity.category === 'gpu') {
    // The curated catalog is authoritative where it has an entry: it is a
    // chip-level fact checked against a cited source, whereas a retailer's
    // spec table describes one board partner's card and is often absent.
    const curated = CURATED_BY_ID.get(identity.partId)
    return {
      partId: identity.partId,
      category: 'gpu',
      brand: identity.brand,
      model: identity.model,
      vramGb: curated?.vramGb ?? identity.vramGb,
      tdpWatts: curated?.tdpWatts ?? null,
      // Only ever from a spec table the retailer published, never inferred.
      recommendedPsuWatts: parseWatts(specs?.['Recommended PSU']),
      powerConnector: curated?.powerConnector ?? parsePowerConnector(specs?.['Power Connectors']),
      lengthMm: parseLengthMm(specs?.['Dimensions']),
    }
  }

  return {
    partId: identity.partId,
    category: 'psu',
    brand: identity.brand,
    model: identity.model,
    ratedWatts: identity.ratedWatts,
    efficiencyRating: identity.efficiencyRating,
  }
}

type SpecPatch = {
  recommendedPsuWatts: number | null
  powerConnector: ReturnType<typeof parsePowerConnector>
  lengthMm: number | null
  vramGb: number | null
}

/** Spec columns observed on a page, if this row published any. */
function specPatch(identity: Identity, specs: ObservedSpecs | undefined): SpecPatch | null {
  if (identity.category !== 'gpu' || !specs) return null
  const patch: SpecPatch = {
    recommendedPsuWatts: parseWatts(specs['Recommended PSU']),
    powerConnector: parsePowerConnector(specs['Power Connectors']),
    lengthMm: parseLengthMm(specs['Dimensions']),
    vramGb: identity.vramGb,
  }
  return Object.values(patch).some((v) => v !== null) ? patch : null
}

/** How demanding a connector is. A higher rank must satisfy a lower one. */
const CONNECTOR_RANK: Record<string, number> = {
  '8pin': 1,
  '2x8pin': 2,
  '12vhpwr': 3,
  '12v-2x6': 3,
}

/**
 * Combine two observations of the same canonical part.
 *
 * Because a part is the chip SKU, several board-partner cards collapse onto it
 * and their published figures differ — ASUS's Prime RX 9070 XT asks for 750W
 * while its TUF sibling asks for 850W. Every field here resolves toward the
 * more demanding value, so the compatibility rules can only ever be too strict,
 * never too lax. Understating a requirement would pass a PSU that cannot drive
 * the card, which is a dead build rather than a bad recommendation.
 *
 * Merging (rather than replacing) also matters because most spec tables are
 * partial: a row that publishes dimensions but no PSU figure must not erase a
 * PSU figure another row already supplied.
 */
function mergePatch(a: SpecPatch | null, b: SpecPatch): SpecPatch {
  if (!a) return b
  const maxOf = (x: number | null, y: number | null) =>
    x === null ? y : y === null ? x : Math.max(x, y)

  const rank = (c: string | null) => (c ? (CONNECTOR_RANK[c] ?? 0) : -1)

  return {
    recommendedPsuWatts: maxOf(a.recommendedPsuWatts, b.recommendedPsuWatts),
    lengthMm: maxOf(a.lengthMm, b.lengthMm),
    vramGb: a.vramGb ?? b.vramGb,
    powerConnector: rank(b.powerConnector) > rank(a.powerConnector)
      ? b.powerConnector
      : a.powerConnector,
  }
}

export async function runNormalize(
  opts: NormalizeOptions = {},
): Promise<NormalizeResult> {
  const log = opts.log ?? ((m: string) => console.log(m))
  const db = getDb()

  const raw = await db
    .select()
    .from(rawListings)
    .where(opts.redo ? sql`true` : isNull(rawListings.normalizedAt))
    .limit(opts.limit ?? 5000)

  const result: NormalizeResult = {
    considered: raw.length,
    matchedDeterministic: 0,
    matchedByAi: 0,
    unmatched: 0,
    partsCreated: 0,
    listingsWritten: 0,
    historyRows: 0,
    skippedNoPrice: 0,
  }

  if (raw.length === 0) {
    log('nothing to normalize')
    return result
  }

  // The catalog we match onto, kept in memory for the run and grown as new
  // parts are discovered.
  const catalog = new Map<string, { brand: string; model: string; category: Category }>()
  const existingSpecs = new Map<string, SpecPatch>()
  for (const p of await db.select().from(parts)) {
    catalog.set(p.partId, { brand: p.brand, model: p.model, category: p.category })
    if (p.category === 'gpu') {
      existingSpecs.set(p.partId, {
        recommendedPsuWatts: p.recommendedPsuWatts,
        powerConnector: p.powerConnector,
        lengthMm: p.lengthMm,
        vramGb: p.vramGb,
      })
    }
  }

  const newParts = new Map<string, NewPart>()
  const patches = new Map<string, SpecPatch>()
  const resolved: {
    rawId: number
    partId: string
    shop: string
    priceLkr: number
    url: string
    inStock: boolean
  }[] = []
  const unmatchedIds: number[] = []
  const useAi = aiAvailable() && !opts.noAi

  for (const row of raw) {
    const payload = (row.rawPayload ?? {}) as Record<string, unknown>
    const category = String(payload.category ?? '') as Category
    const specs = payload.specs as ObservedSpecs | undefined

    const extracted = extractIdentity(category, row.rawTitle)
    // Listings that omit the memory size mint a capacity-less id ("rtx-5090"),
    // which would otherwise sit alongside "rtx-5090-32gb" as a separate product
    // and split that card's prices across two entries.
    const identity: Identity | null = extracted
      ? { ...extracted, partId: canonicalPartId(extracted.partId) }
      : null
    let partId: string | null = identity?.partId ?? null

    if (identity) {
      result.matchedDeterministic++
      if (!catalog.has(identity.partId) && !newParts.has(identity.partId)) {
        newParts.set(identity.partId, toNewPart(identity, specs))
        catalog.set(identity.partId, {
          brand: identity.brand,
          model: identity.model,
          category: identity.category,
        })
      }
      // Always fold in whatever this row published, including for a part just
      // created: a single listing rarely carries the full spec table.
      const patch = specPatch(identity, specs)
      if (patch) {
        const base =
          patches.get(identity.partId) ?? existingSpecs.get(identity.partId) ?? null
        patches.set(identity.partId, mergePatch(base, patch))
      }
    } else if (useAi && (category === 'gpu' || category === 'psu')) {
      // Offer only same-category parts; a PSU can never be the answer for a GPU.
      const candidates: Candidate[] = [...catalog.entries()]
        .filter(([, v]) => v.category === category)
        .map(([partId, v]) => ({ partId, brand: v.brand, model: v.model }))

      const match = await matchTitleToPart(row.rawTitle, category, candidates)
      // A low-confidence guess is treated as no match: an unmatched row is a
      // gap, a wrong one is a wrong price in front of a buyer.
      if (match.partId && match.confidence === 'high') {
        partId = match.partId
        result.matchedByAi++
        // Logged loudly: these are the only rows in the system a model decided,
        // and a wrong one puts the wrong price under a real product. The run
        // log is the audit trail for them.
        log(`  ai match: "${row.rawTitle}" -> ${match.partId} (${match.reason})`)
      } else {
        log(`  no match: ${row.rawTitle} (${match.reason})`)
      }
    }

    if (!partId) {
      result.unmatched++
      unmatchedIds.push(row.id)
      continue
    }

    const price = Number(payload.priceLkr)
    if (!Number.isFinite(price) || price < MIN_PLAUSIBLE_PRICE_LKR) {
      result.skippedNoPrice++
      unmatchedIds.push(row.id)
      continue
    }

    resolved.push({
      rawId: row.id,
      partId,
      shop: row.shop,
      priceLkr: price,
      url: row.sourceUrl,
      inStock: payload.inStock !== false,
    })
  }

  log(
    `resolved ${result.matchedDeterministic} by rule, ${result.matchedByAi} by model, ` +
      `${result.unmatched} unmatched, ${result.skippedNoPrice} without a usable price`,
  )

  if (opts.dryRun) {
    log('dry run — nothing written')
    return result
  }

  // --- writes -------------------------------------------------------------

  if (newParts.size > 0) {
    const values = [...newParts.values()]
    for (let i = 0; i < values.length; i += 100) {
      await db.insert(parts).values(values.slice(i, i + 100)).onConflictDoNothing()
    }
    result.partsCreated = values.length
  }

  // Patches were already merged against the stored values in memory, so these
  // are final and can be written directly.
  for (const [partId, patch] of patches) {
    await db
      .update(parts)
      .set({
        recommendedPsuWatts: patch.recommendedPsuWatts,
        powerConnector: patch.powerConnector,
        lengthMm: patch.lengthMm,
        vramGb: patch.vramGb,
        updatedAt: new Date(),
      })
      .where(eq(parts.partId, partId))
  }

  // One listing per (part, shop): keep the cheapest when a shop lists the same
  // canonical part several times (different board partners, say).
  const bestPerPartShop = new Map<string, (typeof resolved)[number]>()
  for (const r of resolved) {
    const key = `${r.partId} ${r.shop}`
    const existing = bestPerPartShop.get(key)
    if (!existing || r.priceLkr < existing.priceLkr) bestPerPartShop.set(key, r)
  }

  const listingValues = [...bestPerPartShop.values()].map((r) => ({
    partId: r.partId,
    shop: r.shop,
    priceLkr: String(r.priceLkr),
    url: r.url,
    inStock: r.inStock,
    scrapedAt: new Date(),
  }))

  for (let i = 0; i < listingValues.length; i += 100) {
    await db
      .insert(listings)
      .values(listingValues.slice(i, i + 100))
      .onConflictDoUpdate({
        target: [listings.partId, listings.shop],
        set: {
          priceLkr: sql`excluded.price_lkr`,
          url: sql`excluded.url`,
          inStock: sql`excluded.in_stock`,
          scrapedAt: sql`excluded.scraped_at`,
        },
      })
  }
  result.listingsWritten = listingValues.length

  // Append-only daily price points. One row per (part, shop, day): re-running
  // on the same day refreshes that day's price rather than adding a duplicate,
  // which is what keeps the trend line one-point-per-day.
  const today = new Date().toISOString().slice(0, 10)
  const historyValues = [...bestPerPartShop.values()].map((r) => ({
    partId: r.partId,
    shop: r.shop,
    recordedOn: today,
    priceLkr: String(r.priceLkr),
  }))

  for (let i = 0; i < historyValues.length; i += 100) {
    await db
      .insert(priceHistory)
      .values(historyValues.slice(i, i + 100))
      .onConflictDoUpdate({
        target: [priceHistory.partId, priceHistory.shop, priceHistory.recordedOn],
        set: { priceLkr: sql`excluded.price_lkr` },
      })
  }
  result.historyRows = historyValues.length

  // Mark every row we looked at, matched or not, so the next run does not
  // reconsider titles that will never resolve.
  const processedIds = [...resolved.map((r) => r.rawId), ...unmatchedIds]
  for (let i = 0; i < processedIds.length; i += 200) {
    await db
      .update(rawListings)
      .set({ normalizedAt: new Date() })
      .where(inArray(rawListings.id, processedIds.slice(i, i + 200)))
  }

  log(
    `wrote ${result.partsCreated} new parts, ${result.listingsWritten} listings, ` +
      `${result.historyRows} price-history rows`,
  )

  // Curated specs go on last so they overwrite anything a retailer's spec table
  // contributed during this run.
  const curated = await applyCuratedSpecs()
  log(
    `curated catalog: ${curated.partsUpdated}/${curated.curatedEntries} entries applied` +
      (curated.aliasesFolded.length ? `, ${curated.aliasesFolded.length} duplicate parts folded` : '') +
      (curated.uncovered.length ? `, ${curated.uncovered.length} GPU parts still uncovered` : ''),
  )

  return result
}

/** Listings whose shop stopped carrying them are stale; used by the query layer. */
export async function countStaleListings(olderThanDays = 7): Promise<number> {
  const db = getDb()
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(listings)
    .where(sql`${listings.scrapedAt} < now() - make_interval(days => ${olderThanDays})`)
  return rows[0]?.n ?? 0
}

export { and, eq }
