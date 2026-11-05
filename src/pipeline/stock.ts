/**
 * The stock status to record for a scraped row.
 *
 * A scraper reports null when a shop's page does not say. That is unknown, not
 * in stock: on 2026-11-03 winsoft.lk removed the field we read, and treating
 * unknown as in stock listed 230 sold-out parts as buyable, most at the lowest
 * price. So unknown keeps what we last knew, and a listing we have never seen
 * is not claimed as buyable.
 */
export function resolveStock(reported: unknown, lastKnown: boolean | undefined): boolean {
  if (typeof reported === 'boolean') return reported
  return lastKnown ?? false
}
