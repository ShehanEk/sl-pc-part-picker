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
 *  - Where a model ships in several power variants, take the HIGHEST. The
 *    wattage rule may be too strict but must never be too lax.
 *  - Values are chip-level. Board partners deviate on physical specs (length,
 *    extra connectors on OC models), and those stay approximate.
 *  - `aliases` fold part_ids minted from listings that omitted the memory size
 *    ("RTX 5090" with no capacity) onto the canonical id.
 *  - `powerConnector` is only present for series whose source page publishes it.
 *    Leaving it undefined is correct; it must never be guessed.
 */

import type { Category } from '@/scrapers/types'

export type PowerConnector = '8pin' | '2x8pin' | '12vhpwr' | '12v-2x6'

export type CuratedPart = {
  partId: string
  category: Extract<Category, 'gpu'>
  tdpWatts: number
  vramGb: number
  /** Omitted where the source does not publish it — never guessed. */
  powerConnector?: PowerConnector
  /** part_ids seen in listings that mean this same product. */
  aliases?: string[]
  source: string
}

const RTX_50 = 'https://en.wikipedia.org/wiki/GeForce_RTX_50_series'
const RTX_40 = 'https://en.wikipedia.org/wiki/GeForce_RTX_40_series'
const RTX_30 = 'https://en.wikipedia.org/wiki/GeForce_RTX_30_series'
const RTX_20 = 'https://en.wikipedia.org/wiki/GeForce_RTX_20_series'
const GTX_16 = 'https://en.wikipedia.org/wiki/GeForce_GTX_16_series'
const GTX_10 = 'https://en.wikipedia.org/wiki/GeForce_10_series'
const GTX_700 = 'https://en.wikipedia.org/wiki/GeForce_700_series'
const RX_9000 = 'https://en.wikipedia.org/wiki/Radeon_RX_9000_series'
const RX_7000 = 'https://en.wikipedia.org/wiki/Radeon_RX_7000_series'
const RX_6000 = 'https://en.wikipedia.org/wiki/Radeon_RX_6000_series'

export const CURATED_GPUS: CuratedPart[] = [
  // --- GeForce RTX 50 ---------------------------------------------------------
  // Connectors come from this page's "Power" row. Cross-checked against
  // nanotek.lk's own spec tables, which independently report 1x 8-pin for the
  // 5050 and 1x 16-pin (12V-2x6) for the 5070.
  { partId: 'rtx-5050-8gb', category: 'gpu', tdpWatts: 130, vramGb: 8, powerConnector: '8pin', aliases: ['rtx-5050'], source: RTX_50 },
  { partId: 'rtx-5060-8gb', category: 'gpu', tdpWatts: 145, vramGb: 8, powerConnector: '8pin', aliases: ['rtx-5060'], source: RTX_50 },
  { partId: 'rtx-5060-ti-8gb', category: 'gpu', tdpWatts: 180, vramGb: 8, powerConnector: '8pin', source: RTX_50 },
  { partId: 'rtx-5060-ti-16gb', category: 'gpu', tdpWatts: 180, vramGb: 16, powerConnector: '8pin', aliases: ['rtx-5060-ti'], source: RTX_50 },
  { partId: 'rtx-5070-12gb', category: 'gpu', tdpWatts: 250, vramGb: 12, powerConnector: '12v-2x6', aliases: ['rtx-5070'], source: RTX_50 },
  { partId: 'rtx-5070-ti-16gb', category: 'gpu', tdpWatts: 300, vramGb: 16, powerConnector: '12v-2x6', aliases: ['rtx-5070-ti'], source: RTX_50 },
  { partId: 'rtx-5080-16gb', category: 'gpu', tdpWatts: 360, vramGb: 16, powerConnector: '12v-2x6', aliases: ['rtx-5080'], source: RTX_50 },
  { partId: 'rtx-5090-32gb', category: 'gpu', tdpWatts: 575, vramGb: 32, powerConnector: '12v-2x6', aliases: ['rtx-5090'], source: RTX_50 },

  // --- GeForce RTX 40 ---------------------------------------------------------
  { partId: 'rtx-4060-8gb', category: 'gpu', tdpWatts: 115, vramGb: 8, aliases: ['rtx-4060'], source: RTX_40 },
  { partId: 'rtx-4060-ti-8gb', category: 'gpu', tdpWatts: 160, vramGb: 8, aliases: ['rtx-4060-ti'], source: RTX_40 },
  { partId: 'rtx-4060-ti-16gb', category: 'gpu', tdpWatts: 165, vramGb: 16, source: RTX_40 },
  { partId: 'rtx-4070-12gb', category: 'gpu', tdpWatts: 200, vramGb: 12, aliases: ['rtx-4070'], source: RTX_40 },
  { partId: 'rtx-4070-super-12gb', category: 'gpu', tdpWatts: 220, vramGb: 12, aliases: ['rtx-4070-super'], source: RTX_40 },
  { partId: 'rtx-4070-ti-12gb', category: 'gpu', tdpWatts: 285, vramGb: 12, aliases: ['rtx-4070-ti'], source: RTX_40 },
  { partId: 'rtx-4070-ti-super-16gb', category: 'gpu', tdpWatts: 285, vramGb: 16, aliases: ['rtx-4070-ti-super'], source: RTX_40 },
  { partId: 'rtx-4080-16gb', category: 'gpu', tdpWatts: 320, vramGb: 16, aliases: ['rtx-4080'], source: RTX_40 },
  { partId: 'rtx-4080-super-16gb', category: 'gpu', tdpWatts: 320, vramGb: 16, aliases: ['rtx-4080-super'], source: RTX_40 },
  { partId: 'rtx-4090-24gb', category: 'gpu', tdpWatts: 450, vramGb: 24, aliases: ['rtx-4090'], source: RTX_40 },

  // --- GeForce RTX 30 ---------------------------------------------------------
  // 3050 8GB is listed at both 115W and 130W, and 3070 Ti at 290W and 320W;
  // the higher figure is taken in each case.
  { partId: 'rtx-3050-6gb', category: 'gpu', tdpWatts: 70, vramGb: 6, source: RTX_30 },
  { partId: 'rtx-3050-8gb', category: 'gpu', tdpWatts: 130, vramGb: 8, aliases: ['rtx-3050'], source: RTX_30 },
  { partId: 'rtx-3060-8gb', category: 'gpu', tdpWatts: 170, vramGb: 8, source: RTX_30 },
  { partId: 'rtx-3060-12gb', category: 'gpu', tdpWatts: 170, vramGb: 12, aliases: ['rtx-3060'], source: RTX_30 },
  { partId: 'rtx-3060-ti-8gb', category: 'gpu', tdpWatts: 200, vramGb: 8, aliases: ['rtx-3060-ti'], source: RTX_30 },
  { partId: 'rtx-3070-8gb', category: 'gpu', tdpWatts: 220, vramGb: 8, aliases: ['rtx-3070'], source: RTX_30 },
  { partId: 'rtx-3070-ti-8gb', category: 'gpu', tdpWatts: 320, vramGb: 8, aliases: ['rtx-3070-ti'], source: RTX_30 },
  { partId: 'rtx-3080-10gb', category: 'gpu', tdpWatts: 320, vramGb: 10, aliases: ['rtx-3080'], source: RTX_30 },
  { partId: 'rtx-3080-12gb', category: 'gpu', tdpWatts: 350, vramGb: 12, source: RTX_30 },
  { partId: 'rtx-3080-ti-12gb', category: 'gpu', tdpWatts: 350, vramGb: 12, aliases: ['rtx-3080-ti'], source: RTX_30 },
  { partId: 'rtx-3090-24gb', category: 'gpu', tdpWatts: 350, vramGb: 24, aliases: ['rtx-3090'], source: RTX_30 },

  // --- GeForce RTX 20 ---------------------------------------------------------
  { partId: 'rtx-2060-6gb', category: 'gpu', tdpWatts: 160, vramGb: 6, aliases: ['rtx-2060'], source: RTX_20 },
  { partId: 'rtx-2060-12gb', category: 'gpu', tdpWatts: 185, vramGb: 12, source: RTX_20 },

  // --- GeForce GTX 16 ---------------------------------------------------------
  // The 1650 is listed at 75W, 80W and 90W across its memory revisions.
  { partId: 'gtx-1630-4gb', category: 'gpu', tdpWatts: 75, vramGb: 4, aliases: ['gtx-1630'], source: GTX_16 },
  { partId: 'gtx-1650-4gb', category: 'gpu', tdpWatts: 90, vramGb: 4, aliases: ['gtx-1650'], source: GTX_16 },
  { partId: 'gtx-1650-super-4gb', category: 'gpu', tdpWatts: 100, vramGb: 4, aliases: ['gtx-1650-super'], source: GTX_16 },
  { partId: 'gtx-1660-6gb', category: 'gpu', tdpWatts: 120, vramGb: 6, aliases: ['gtx-1660'], source: GTX_16 },
  { partId: 'gtx-1660-super-6gb', category: 'gpu', tdpWatts: 125, vramGb: 6, aliases: ['gtx-1660-super'], source: GTX_16 },
  { partId: 'gtx-1660-ti-6gb', category: 'gpu', tdpWatts: 120, vramGb: 6, aliases: ['gtx-1660-ti'], source: GTX_16 },

  // --- GeForce GTX 10 ---------------------------------------------------------
  // The GT 1030 is listed at 30W (GDDR5) and 20W (DDR4); the 4GB cards local
  // shops carry are the DDR4 part, and 30W covers both.
  { partId: 'gt-1030-2gb', category: 'gpu', tdpWatts: 30, vramGb: 2, aliases: ['gt-1030'], source: GTX_10 },
  { partId: 'gt-1030-4gb', category: 'gpu', tdpWatts: 30, vramGb: 4, source: GTX_10 },
  // Every listed GTX 1050 variant (2GB, 3GB) is 75W, as is the 1050 Ti.
  { partId: 'gtx-1050-2gb', category: 'gpu', tdpWatts: 75, vramGb: 2, aliases: ['gtx-1050'], source: GTX_10 },
  { partId: 'gtx-1050-4gb', category: 'gpu', tdpWatts: 75, vramGb: 4, source: GTX_10 },
  { partId: 'gtx-1050-ti-4gb', category: 'gpu', tdpWatts: 75, vramGb: 4, aliases: ['gtx-1050-ti'], source: GTX_10 },

  // --- GeForce 700 ------------------------------------------------------------
  // The GT 730 spans 23W/25W/49W across its memory configurations.
  { partId: 'gt-710-2gb', category: 'gpu', tdpWatts: 19, vramGb: 2, aliases: ['gt-710'], source: GTX_700 },
  { partId: 'gt-730-4gb', category: 'gpu', tdpWatts: 49, vramGb: 4, aliases: ['gt-730'], source: GTX_700 },
  { partId: 'gtx-750-ti-4gb', category: 'gpu', tdpWatts: 60, vramGb: 4, aliases: ['gtx-750-ti'], source: GTX_700 },

  // --- Radeon RX 9000 ---------------------------------------------------------
  // Connectors from this page's "Power" row; nanotek.lk independently reports
  // 1x 8-pin for the 9060 XT.
  { partId: 'rx-9060-xt-8gb', category: 'gpu', tdpWatts: 150, vramGb: 8, powerConnector: '8pin', source: RX_9000 },
  { partId: 'rx-9060-xt-16gb', category: 'gpu', tdpWatts: 160, vramGb: 16, powerConnector: '8pin', aliases: ['rx-9060-xt'], source: RX_9000 },
  { partId: 'rx-9070-16gb', category: 'gpu', tdpWatts: 220, vramGb: 16, powerConnector: '2x8pin', aliases: ['rx-9070'], source: RX_9000 },
  { partId: 'rx-9070-xt-16gb', category: 'gpu', tdpWatts: 304, vramGb: 16, powerConnector: '2x8pin', aliases: ['rx-9070-xt'], source: RX_9000 },

  // --- Radeon RX 7000 / 6000 --------------------------------------------------
  // AMD publishes TBP (total board power) rather than TDP; the 6500 XT is
  // listed at 107W and 113W.
  { partId: 'rx-7600-8gb', category: 'gpu', tdpWatts: 165, vramGb: 8, aliases: ['rx-7600'], source: RX_7000 },
  { partId: 'rx-6500-xt-4gb', category: 'gpu', tdpWatts: 113, vramGb: 4, aliases: ['rx-6500-xt'], source: RX_6000 },
  { partId: 'rx-6700-xt-12gb', category: 'gpu', tdpWatts: 230, vramGb: 12, aliases: ['rx-6700-xt'], source: RX_6000 },
  { partId: 'rx-6800-16gb', category: 'gpu', tdpWatts: 250, vramGb: 16, aliases: ['rx-6800'], source: RX_6000 },
  { partId: 'rx-6900-xt-16gb', category: 'gpu', tdpWatts: 300, vramGb: 16, aliases: ['rx-6900-xt'], source: RX_6000 },

  // Not covered: Radeon RX 550, Intel Arc B580, and the workstation cards
  // (RTX 2000 Ada, RTX A400, RTX A4500). One local listing each, and the
  // workstation line is outside the MVP's gaming-build scope.
]

/** alias part_id → canonical part_id */
export const PART_ALIASES: Record<string, string> = Object.fromEntries(
  CURATED_GPUS.flatMap((p) => (p.aliases ?? []).map((a) => [a, p.partId])),
)

export const CURATED_BY_ID: Map<string, CuratedPart> = new Map(
  CURATED_GPUS.map((p) => [p.partId, p]),
)

/**
 * Chip key (everything before the capacity) → the capacities that chip ships in.
 *
 * Used to catch impossible extractions. One retailer lists
 * "MSI RTX 4070 SN132500052688TI SUPER 16G" — a serial number wedged between
 * the model and its Ti Super suffix — which parses as a 16GB RTX 4070, a card
 * that does not exist. Anything the catalog can prove impossible is routed to
 * the AI pass instead of silently minting a bogus part.
 */
export const VALID_VRAM_BY_CHIP: Map<string, Set<number>> = (() => {
  const map = new Map<string, Set<number>>()
  for (const p of CURATED_GPUS) {
    const chip = p.partId.replace(/-\d+gb$/, '')
    if (!map.has(chip)) map.set(chip, new Set())
    map.get(chip)!.add(p.vramGb)
  }
  return map
})()

/** Resolve a part_id through the alias table. */
export function canonicalPartId(partId: string): string {
  return PART_ALIASES[partId] ?? partId
}

/**
 * True when the catalog knows this chip and the capacity is not one it ships in
 * — i.e. the title was almost certainly mis-parsed. Unknown chips return false:
 * absence from the catalog is not evidence of anything.
 */
export function isImpossibleGpu(partId: string): boolean {
  const m = partId.match(/^(.*)-(\d+)gb$/)
  if (!m) return false
  const known = VALID_VRAM_BY_CHIP.get(m[1])
  return known !== undefined && !known.has(Number(m[2]))
}
