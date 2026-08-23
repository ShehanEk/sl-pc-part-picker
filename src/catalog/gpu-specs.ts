/**
 * Curated GPU spec catalog.
 *
 * These are global facts about a chip, not about a shop's listing, so they do
 * not belong in the scrapers. A retailer only tells us a price; an RTX 5070
 * draws 250W whoever is selling it.
 *
 * Rules for editing this file:
 *
 *  - Every entry carries the `source` it was read from. Do not add a value from
 *    memory or from a model's recall — look it up and cite it. A wrong TDP here
 *    silently produces a wrong "your PSU is fine" answer downstream, which is a
 *    dead build rather than a bad recommendation.
 *  - Values are chip-level. Board partners deviate on physical specs (length,
 *    extra connectors on OC models), and those stay approximate — see
 *    docs/retailers.md.
 *  - `aliases` fold part_ids minted from listings that omitted the memory size
 *    ("RTX 5090" with no capacity) onto the canonical id.
 */

import type { Category } from '@/scrapers/types'

export type PowerConnector = '8pin' | '2x8pin' | '12vhpwr' | '12v-2x6'

export type CuratedPart = {
  partId: string
  category: Extract<Category, 'gpu'>
  tdpWatts: number
  powerConnector: PowerConnector
  vramGb: number
  /** part_ids seen in listings that mean this same product. */
  aliases?: string[]
  source: string
}

const RTX_50 = 'https://en.wikipedia.org/wiki/GeForce_RTX_50_series'
const RX_9000 = 'https://en.wikipedia.org/wiki/Radeon_RX_9000_series'

export const CURATED_GPUS: CuratedPart[] = [
  // --- GeForce RTX 50 series -------------------------------------------------
  // Cross-checked against nanotek.lk's published spec tables, which independently
  // report 1x 8-pin for the 5050 and 1x 16-pin (12V-2x6) for the 5070.
  { partId: 'rtx-5050-8gb', category: 'gpu', tdpWatts: 130, powerConnector: '8pin', vramGb: 8, aliases: ['rtx-5050'], source: RTX_50 },
  { partId: 'rtx-5060-8gb', category: 'gpu', tdpWatts: 145, powerConnector: '8pin', vramGb: 8, aliases: ['rtx-5060'], source: RTX_50 },
  { partId: 'rtx-5060-ti-8gb', category: 'gpu', tdpWatts: 180, powerConnector: '8pin', vramGb: 8, source: RTX_50 },
  { partId: 'rtx-5060-ti-16gb', category: 'gpu', tdpWatts: 180, powerConnector: '8pin', vramGb: 16, aliases: ['rtx-5060-ti'], source: RTX_50 },
  { partId: 'rtx-5070-12gb', category: 'gpu', tdpWatts: 250, powerConnector: '12v-2x6', vramGb: 12, aliases: ['rtx-5070'], source: RTX_50 },
  { partId: 'rtx-5070-ti-16gb', category: 'gpu', tdpWatts: 300, powerConnector: '12v-2x6', vramGb: 16, aliases: ['rtx-5070-ti'], source: RTX_50 },
  { partId: 'rtx-5080-16gb', category: 'gpu', tdpWatts: 360, powerConnector: '12v-2x6', vramGb: 16, aliases: ['rtx-5080'], source: RTX_50 },
  { partId: 'rtx-5090-32gb', category: 'gpu', tdpWatts: 575, powerConnector: '12v-2x6', vramGb: 32, aliases: ['rtx-5090'], source: RTX_50 },

  // --- Radeon RX 9000 series -------------------------------------------------
  // The 9060 XT ships in two capacities with different TDPs (150W / 160W).
  // nanotek.lk independently reports 1x 8-pin for the 9060 XT.
  { partId: 'rx-9060-xt-8gb', category: 'gpu', tdpWatts: 150, powerConnector: '8pin', vramGb: 8, source: RX_9000 },
  { partId: 'rx-9060-xt-16gb', category: 'gpu', tdpWatts: 160, powerConnector: '8pin', vramGb: 16, aliases: ['rx-9060-xt'], source: RX_9000 },
  { partId: 'rx-9070-16gb', category: 'gpu', tdpWatts: 220, powerConnector: '2x8pin', vramGb: 16, aliases: ['rx-9070'], source: RX_9000 },
  { partId: 'rx-9070-xt-16gb', category: 'gpu', tdpWatts: 304, powerConnector: '2x8pin', vramGb: 16, aliases: ['rx-9070-xt'], source: RX_9000 },

  // TODO: RTX 40/30 series, GTX 16/10 series, RX 6000/7000. Their Wikipedia
  // pages use a row-per-model table rather than the column-per-model layout
  // above, so they need reading separately. Until then those parts keep
  // whatever a retailer happened to publish, and the PSU rule cannot run for
  // them — see the coverage report from `npm run seed:specs`.
]

/** alias part_id → canonical part_id */
export const PART_ALIASES: Record<string, string> = Object.fromEntries(
  CURATED_GPUS.flatMap((p) => (p.aliases ?? []).map((a) => [a, p.partId])),
)

export const CURATED_BY_ID: Map<string, CuratedPart> = new Map(
  CURATED_GPUS.map((p) => [p.partId, p]),
)

/** Resolve a part_id through the alias table. */
export function canonicalPartId(partId: string): string {
  return PART_ALIASES[partId] ?? partId
}
