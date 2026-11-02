/** The numbers on a shop's home-page profile, worked out from our own listings. */

type StatsOffer = { shop: string; priceLkr: number; inStock: boolean; stale: boolean }

export type ShopStats = {
  /** Parts with any listing from this shop, in stock or not. */
  parts: number
  /**
   * Share of those parts it has in stock with a recent price. 0–100. Null when
   * none of its listings are recent: our sync has stopped, which says nothing
   * about the shop.
   */
  inStockPct: number | null
  /**
   * Of the parts it has in stock that another shop also has in stock, the share
   * where it holds the lowest price. Ties count for every tied shop. 0–100. Null
   * when there are no such parts.
   */
  cheapestPct: number | null
}

/**
 * A shop can list one part several times, because graphics cards are matched by
 * chip, so everything here counts parts and not listings.
 */
export function shopStats(
  parts: { offers: StatsOffer[] }[],
  shops: readonly string[],
): Record<string, ShopStats> {
  const tally = new Map(
    shops.map((s) => [s, { parts: 0, recent: 0, inStock: 0, contested: 0, cheapest: 0 }]),
  )

  for (const part of parts) {
    for (const shop of new Set(part.offers.map((o) => o.shop))) {
      const t = tally.get(shop)
      if (!t) continue
      t.parts++
      if (part.offers.some((o) => o.shop === shop && !o.stale)) t.recent++
    }

    const buyable = part.offers.filter((o) => o.inStock && !o.stale)
    const buyableShops = new Set(buyable.map((o) => o.shop))
    const best = Math.min(...buyable.map((o) => o.priceLkr))

    for (const shop of buyableShops) {
      const t = tally.get(shop)
      if (!t) continue
      t.inStock++
      if (buyableShops.size < 2) continue
      t.contested++
      if (buyable.some((o) => o.shop === shop && o.priceLkr === best)) t.cheapest++
    }
  }

  const pct = (n: number, of: number) => (of === 0 ? null : Math.round((n / of) * 100))
  return Object.fromEntries(
    [...tally].map(([shop, t]) => [
      shop,
      {
        parts: t.parts,
        inStockPct: t.recent === 0 ? null : pct(t.inStock, t.parts),
        cheapestPct: pct(t.cheapest, t.contested),
      },
    ]),
  )
}
