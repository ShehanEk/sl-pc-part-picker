import { and, eq, sql } from 'drizzle-orm'

import { getDb } from '@/db'
import { listings, partOverrides, parts, priceHistory } from '@/db/schema'

import { CURATED_CPUS } from './cpu-specs'
import { CURATED_GPUS, PART_ALIASES } from './gpu-specs'
import { CURATED_PSUS, PSU_ALIASES } from './psu-specs'

/** Both catalogs fold duplicate ids the same way, so they share one alias map. */
const ALL_ALIASES: Record<string, string> = { ...PART_ALIASES, ...PSU_ALIASES }

/**
 * Push the curated catalog onto the `parts` table.
 *
 * Runs independently of scraping so a part gets its specs whether or not a
 * retailer happened to publish a spec table. Curated values win outright: they
 * are chip-level facts with a cited source, while a scraped table describes one
 * board partner's card.
 */

export type ApplyResult = {
  curatedEntries: number
  partsUpdated: number
  /** Curated entries with no matching part — the catalog covers something nobody stocks. */
  notStocked: string[]
  aliasesFolded: string[]
  /** GPU parts in the database the curated catalog does not cover yet. */
  uncovered: { partId: string; shops: number }[]
  psuEntries: number
  psusUpdated: number
  cpuEntries: number
  cpusUpdated: number
  /** Processors still without a published draw, so power sizing assumes one. */
  cpusUncovered: number
  /** PSU parts still without a connector list, so the connector rule stays unknown. */
  psusUncovered: number
}

/**
 * Repoint an alias part's rows onto its canonical part, then drop the alias.
 *
 * Needed for rows normalized before the alias existed: "RTX 5090" with no
 * capacity became its own part and split that card's prices away from
 * "rtx-5090-32gb".
 */
async function foldAliases(): Promise<string[]> {
  const db = getDb()
  const folded: string[] = []

  for (const [alias, canonical] of Object.entries(ALL_ALIASES)) {
    const aliasPart = await db.select().from(parts).where(eq(parts.partId, alias))
    if (aliasPart.length === 0) continue

    // Move listings whose shop the canonical part does not already cover.
    const canonicalShops = new Set(
      (
        await db
          .select({ shop: listings.shop })
          .from(listings)
          .where(eq(listings.partId, canonical))
      ).map((r) => r.shop),
    )
    const aliasListings = await db.select().from(listings).where(eq(listings.partId, alias))
    for (const l of aliasListings) {
      if (canonicalShops.has(l.shop)) continue
      await db.update(listings).set({ partId: canonical }).where(eq(listings.id, l.id))
      canonicalShops.add(l.shop)
    }

    // Same for price history, keyed by (part, shop, day).
    const aliasHistory = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.partId, alias))
    for (const h of aliasHistory) {
      const clash = await db
        .select()
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.partId, canonical),
            eq(priceHistory.shop, h.shop),
            eq(priceHistory.recordedOn, h.recordedOn),
          ),
        )
      if (clash.length > 0) continue
      await db
        .update(priceHistory)
        .set({ partId: canonical })
        .where(
          and(
            eq(priceHistory.partId, alias),
            eq(priceHistory.shop, h.shop),
            eq(priceHistory.recordedOn, h.recordedOn),
          ),
        )
    }

    // Carry any hand-entered override across before the alias row goes.
    //
    // `part_overrides` has no foreign key precisely so the delete below cannot
    // cascade into it, but that only stops the work being destroyed — without
    // this it would be stranded on an id nothing resolves to any more. Fields
    // the canonical part already has an opinion on win, matching how listings
    // and history are folded above.
    const aliasOverride = (
      await db.select().from(partOverrides).where(eq(partOverrides.partId, alias))
    )[0]
    if (aliasOverride) {
      const canonicalOverride = (
        await db.select().from(partOverrides).where(eq(partOverrides.partId, canonical))
      )[0]

      if (!canonicalOverride) {
        await db
          .update(partOverrides)
          .set({ partId: canonical })
          .where(eq(partOverrides.partId, alias))
      } else {
        const merged = { ...aliasOverride, ...stripNulls(canonicalOverride) }
        await db
          .update(partOverrides)
          .set({ ...merged, partId: canonical, updatedAt: new Date() })
          .where(eq(partOverrides.partId, canonical))
        await db.delete(partOverrides).where(eq(partOverrides.partId, alias))
      }
    }

    // Anything left over is a duplicate of a row the canonical part already has.
    await db.delete(parts).where(eq(parts.partId, alias)) // cascades to both tables
    folded.push(`${alias} -> ${canonical}`)
  }

  return folded
}

/** Drop null fields so a spread keeps the other side's value. */
function stripNulls<T extends object>(row: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<T>
}

export async function applyCuratedSpecs(): Promise<ApplyResult> {
  const db = getDb()
  const aliasesFolded = await foldAliases()

  const present = new Set(
    (await db.select({ partId: parts.partId }).from(parts)).map((p) => p.partId),
  )

  const notStocked: string[] = []
  let partsUpdated = 0

  for (const curated of CURATED_GPUS) {
    if (!present.has(curated.partId)) {
      notStocked.push(curated.partId)
      continue
    }
    await db
      .update(parts)
      .set({
        tdpWatts: curated.tdpWatts,
        vramGb: curated.vramGb,
        // Only set when the catalog has it. Writing undefined here would erase
        // a connector a retailer's spec table did supply.
        ...(curated.powerConnector ? { powerConnector: curated.powerConnector } : {}),
        updatedAt: new Date(),
      })
      .where(eq(parts.partId, curated.partId))
    partsUpdated++
  }

  let psusUpdated = 0
  for (const curated of CURATED_PSUS) {
    if (!present.has(curated.partId)) {
      notStocked.push(curated.partId)
      continue
    }
    await db
      .update(parts)
      .set({ connectors: curated.connectors, updatedAt: new Date() })
      .where(eq(parts.partId, curated.partId))
    psusUpdated++
  }

  let cpusUpdated = 0
  for (const curated of CURATED_CPUS) {
    if (!present.has(curated.partId)) {
      notStocked.push(curated.partId)
      continue
    }
    await db
      .update(parts)
      .set({ tdpWatts: curated.tdpWatts, updatedAt: new Date() })
      .where(eq(parts.partId, curated.partId))
    cpusUpdated++
  }

  const [psuGap] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(parts)
    .where(sql`${parts.category} = 'psu' and ${parts.connectors} is null`)

  const [cpuGap] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(parts)
    .where(sql`${parts.category} = 'cpu' and ${parts.tdpWatts} is null`)

  const curatedIds = new Set(CURATED_GPUS.map((p) => p.partId))
  const gpuRows = await db
    .select({
      partId: parts.partId,
      shops: sql<number>`count(distinct ${listings.shop})::int`,
    })
    .from(parts)
    .leftJoin(listings, eq(listings.partId, parts.partId))
    .where(eq(parts.category, 'gpu'))
    .groupBy(parts.partId)

  return {
    curatedEntries: CURATED_GPUS.length,
    partsUpdated,
    notStocked,
    aliasesFolded,
    uncovered: gpuRows
      .filter((r) => !curatedIds.has(r.partId))
      .sort((a, b) => b.shops - a.shops),
    psuEntries: CURATED_PSUS.length,
    psusUpdated,
    psusUncovered: psuGap?.n ?? 0,
    cpuEntries: CURATED_CPUS.length,
    cpusUpdated,
    cpusUncovered: cpuGap?.n ?? 0,
  }
}
