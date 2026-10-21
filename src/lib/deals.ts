import type { DealItem } from '@/app/components/Deals'
import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { CATEGORY_COPY } from '@/lib/site'
import { displayName } from '@/lib/specs'
import type { Directory, PricePoint, SeoPart } from '@/queries/seo'

/**
 * Parts selling below their usual price.
 *
 * A deal is a part whose cheapest in-stock price now is at least 5% under the
 * median of its daily lowest in-stock price over the previous 30 days, with at
 * least 7 of those days on record so a part we only just started tracking
 * cannot show a drop it never had. Drops over 30% are left out as likely
 * matching errors.
 *
 * "Below usual", not "price cut": a deal can also be a shop we added that sells
 * cheaper than the ones we tracked before. Either way it is cheaper to buy now.
 *
 * Built from data the pages already load (the directory and the price index),
 * so it costs no extra query.
 */

const THRESHOLD = 0.05
/**
 * Above this the "deal" is more likely a listing matched to the wrong part
 * than a real discount, and a deals page would put that error at the top. The
 * first one seen was an 8GB card filed under its 16GB sibling at "−33%".
 */
const IMPLAUSIBLE = 0.3
const WINDOW_DAYS = 30
const MIN_DAYS = 7

export type Deal = {
  slot: BuildSlot
  part: SeoPart
  priceLkr: number
  shop: string
  usualLkr: number
  savingLkr: number
  /** Whole percent, rounded. */
  percent: number
  /** Cheaper now than on any day in the window. */
  lowest: boolean
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function findDeals(
  directory: Directory,
  priceIndex: Record<string, PricePoint[]>,
  now = new Date(),
): Deal[] {
  const today = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)

  const deals: Deal[] = []
  for (const slot of BUILD_SLOTS) {
    for (const part of directory[slot]) {
      // Offers are sorted buyable-first then cheapest.
      const best = part.offers.find((o) => o.inStock && !o.stale)
      if (!best) continue

      // Today is left out: it is the price being judged, not the norm.
      const lows = (priceIndex[part.partId] ?? [])
        .filter((p) => p.day >= from && p.day < today)
        .map((p) => p.lowestLkr)
      if (lows.length < MIN_DAYS) continue

      const usual = median(lows)
      if (best.priceLkr > usual * (1 - THRESHOLD)) continue
      if (best.priceLkr < usual * (1 - IMPLAUSIBLE)) continue

      deals.push({
        slot,
        part,
        priceLkr: best.priceLkr,
        shop: best.shop,
        usualLkr: Math.round(usual),
        savingLkr: Math.round(usual - best.priceLkr),
        percent: Math.round((100 * (usual - best.priceLkr)) / usual),
        lowest: best.priceLkr < Math.min(...lows),
      })
    }
  }
  return deals.sort((a, b) => b.percent - a.percent || b.savingLkr - a.savingLkr)
}

/** What the deal list and cards render, without the whole part. */
export function toDealItems(deals: Deal[]): DealItem[] {
  return deals.map((d) => ({
    slot: d.slot,
    heading: CATEGORY_COPY[d.slot].heading,
    partId: d.part.partId,
    name: displayName(d.part),
    priceLkr: d.priceLkr,
    shop: d.shop,
    usualLkr: d.usualLkr,
    savingLkr: d.savingLkr,
    percent: d.percent,
    lowest: d.lowest,
  }))
}
