import { politeGet } from '@/lib/http'

import type { Category, ScrapeOptions, ScrapedRow, Scraper } from './types'

/**
 * pcbuilders.lk — WordPress + WooCommerce.
 *
 * The best-structured source of the five, and the only one with a real API: the
 * WooCommerce Store API is public, returns JSON, and carries the product's own
 * attribute table (MANUFACTURER, MODEL, RAM - SIZE) alongside price and stock.
 * No HTML parsing at all.
 *
 * robots.txt disallows only /cart/, /checkout/, /my-account/ and add-to-cart
 * links. The Store API is the storefront's own read endpoint and is not
 * disallowed; nothing here touches a blocked path.
 *
 * Two things about this shop needed deciding rather than reading off the page —
 * see the notes on the category map and on stock below. Both are cases where
 * the obvious reading of the data would have put a price in front of a buyer
 * that they could not actually pay.
 */
const BASE_URL = 'https://pcbuilders.lk'
const API = `${BASE_URL}/wp-json/wc/store/v1/products`

/**
 * Canonical category → WooCommerce term id.
 *
 * Every id here sits under `components`. The shop also keeps a parallel
 * `all-used-items` tree (used graphics cards, processors, boards, supplies),
 * deliberately excluded: a used card at half price would win every comparison
 * it appeared in, against new stock, with nothing on the row to say why.
 *
 * Filtering by a parent id includes its children, so these seven cover the
 * Intel/AMD, desktop-RAM, NVMe and hard-disk sub-categories without listing
 * them (verified: processors=41 against intel 19 + amd 20).
 */
const CATEGORY_IDS: Partial<Record<Category, { id: number; label: string }>> = {
  gpu: { id: 95, label: 'GRAPHIC CARDS' },
  cpu: { id: 58, label: 'PROCESSORS' },
  motherboard: { id: 69, label: 'MOTHERBOARDS' },
  ram: { id: 78, label: 'MEMORY' },
  storage: { id: 81, label: 'STORAGE' },
  psu: { id: 76, label: 'POWER SUPPLY & UPS' },
  case: { id: 143, label: 'COMPUTER CASE' },
}

const PER_PAGE = 100

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  times: '×',
  hellip: '…',
}

/**
 * WordPress returns product names HTML-encoded, and JSON does not decode them.
 *
 * The other scrapers get this for free because they parse markup with cheerio.
 * Here the entity survives into the title, and from there into the part id: two
 * colours of "Corsair 3200D RS ARGB Mid-Tower Case &#8211; White" both minted
 * `corsair-3200d-rs-8211-atx`, with the numeric entity sitting in the id as
 * though it were part of the model name.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
}

/**
 * Conditions that are not new stock, however the shop has filed them.
 *
 * The used tree is excluded by the category map, but a handful of open-box
 * items are listed among new ones. Same reasoning: a lower price for a
 * different condition, with no way to say so on the row.
 */
const NOT_NEW = /\b(open[\s-]*box|used|refurb(?:ished)?|pre[\s-]*owned|b[\s-]*grade)\b/i

type StoreProduct = {
  id: number
  name: string
  permalink: string
  sku?: string
  short_description?: string
  prices?: {
    price?: string
    regular_price?: string
    currency_code?: string
    currency_minor_unit?: number
  }
  is_in_stock?: boolean
  is_on_backorder?: boolean
  stock_availability?: { text?: string }
  images?: { src?: string }[]
  categories?: { name?: string; slug?: string }[]
  attributes?: { name?: string; terms?: { name?: string }[] }[]
}

/**
 * Store API prices are integer minor units as a string: "168050000" with
 * `currency_minor_unit: 2` is 1,680,500.00 LKR. Reading the field as a number
 * without dividing would have made every price a hundred times too large.
 */
export function toRupees(
  raw: string | undefined,
  minorUnit: number | undefined,
): number | null {
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  const places = Number.isFinite(minorUnit) ? (minorUnit as number) : 2
  return value / 10 ** places
}

/** The product's own attribute table, flattened for the payload. */
function toSpecs(product: StoreProduct): Record<string, string> | undefined {
  const specs: Record<string, string> = {}
  for (const attribute of product.attributes ?? []) {
    const label = attribute.name ? decodeEntities(attribute.name).trim() : ''
    const value = (attribute.terms ?? [])
      .map((t) => (t.name ? decodeEntities(t.name).trim() : ''))
      .filter(Boolean)
      .join(', ')
    if (label && value) specs[label] = value
  }
  // Consistently carries the warranty ("3 YEARS WARRANTY"), which no other
  // retailer publishes in a field of its own. Nothing reads it yet.
  const warranty = product.short_description
    ? decodeEntities(product.short_description.replace(/<[^>]*>/g, '')).trim()
    : ''
  if (warranty) specs['Short description'] = warranty

  return Object.keys(specs).length > 0 ? specs : undefined
}

export const pcbuilders: Scraper = {
  shop: 'pcbuilders.lk',
  baseUrl: BASE_URL,
  categories: Object.keys(CATEGORY_IDS) as Category[],

  async scrape(opts: ScrapeOptions = {}) {
    const log = opts.log ?? (() => {})
    const wanted = opts.categories?.length
      ? opts.categories
      : (Object.keys(CATEGORY_IDS) as Category[])
    const rows: ScrapedRow[] = []

    for (const category of wanted) {
      const meta = CATEGORY_IDS[category]
      if (!meta) continue

      const found: ScrapedRow[] = []
      const maxPages = opts.maxPages ?? Infinity
      let page = 1

      // The Store API reports totals in headers the fetch helper does not
      // surface, so pagination stops on a short page instead.
      while (page <= maxPages) {
        const url = `${API}?category=${meta.id}&per_page=${PER_PAGE}&page=${page}`
        const res = await politeGet(url)
        if (res.status !== 200) {
          log(`  ${category}: HTTP ${res.status} on page ${page}, stopping`)
          break
        }

        let batch: StoreProduct[]
        try {
          const parsed: unknown = JSON.parse(res.body)
          batch = Array.isArray(parsed) ? (parsed as StoreProduct[]) : []
        } catch {
          log(`  ${category}: page ${page} was not JSON, stopping`)
          break
        }

        for (const product of batch) {
          const title = product.name ? decodeEntities(product.name).trim() : ''
          if (!title) continue
          if (NOT_NEW.test(title)) continue

          const priceLkr = toRupees(product.prices?.price, product.prices?.currency_minor_unit)
          const listPriceLkr = toRupees(
            product.prices?.regular_price,
            product.prices?.currency_minor_unit,
          )

          // `is_in_stock` is true for backordered items too — over half this
          // shop's graphics cards are "Available on backorder" while flagged in
          // stock. Taking the flag at face value would have advertised same-day
          // availability for parts that have to be ordered in.
          const onBackorder =
            product.is_on_backorder === true ||
            /backorder/i.test(product.stock_availability?.text ?? '')

          found.push({
            shop: 'pcbuilders.lk',
            sourceUrl: product.permalink,
            rawTitle: title,
            rawPriceText:
              product.prices?.price != null
                ? `${product.prices.currency_code ?? 'LKR'} ${priceLkr ?? ''}`
                : null,
            payload: {
              category,
              retailerCategory:
                product.categories
                  ?.map((c) => (c.name ? decodeEntities(c.name) : c.slug))
                  .filter(Boolean)
                  .join(', ') || meta.label,
              externalId: String(product.id),
              priceLkr,
              listPriceLkr,
              inStock: product.is_in_stock === true && !onBackorder,
              preOrder: onBackorder,
              imageUrl: product.images?.[0]?.src ?? null,
              sku: product.sku || null,
              stockText: product.stock_availability?.text ?? null,
              specs: toSpecs(product),
            },
          })
        }

        if (batch.length < PER_PAGE) break
        page++
      }

      const capped =
        opts.maxProducts != null ? found.slice(0, opts.maxProducts) : found
      rows.push(...capped)
      log(`  ${category}: ${capped.length} products`)
    }

    return rows
  },
}
