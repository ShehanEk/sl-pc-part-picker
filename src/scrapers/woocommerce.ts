import { politeGet } from '@/lib/http'

import type { Category, ScrapeOptions, ScrapedRow, Scraper } from './types'

/**
 * pcbuilders.lk and tecroot.lk both run WordPress + WooCommerce, so they share
 * this fetch flow over the WooCommerce Store API: public, JSON, and carrying the
 * product's own attribute table alongside price and stock. No HTML parsing.
 *
 * The Store API is the storefront's own read endpoint. Neither shop's
 * robots.txt disallows it (check `per_page`; see docs/status.md).
 */

export type WooCategoryId = { id: number; label: string }

export type WooConfig = {
  shop: string
  baseUrl: string
  /** Canonical category → WooCommerce term id, or several. */
  categoryIds: Partial<Record<Category, WooCategoryId | WooCategoryId[]>>
  /**
   * The attribute holding the brand, for shops whose product names leave it
   * out: tecroot.lk lists "Pro B760M-P DDR4" with "Brands: MSI" beside it. The
   * brand is put in front of the title, because every extractor reads the
   * brand from there.
   */
  brandAttribute?: string
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
 * Conditions that are not new stock, however the shop has filed them: a lower
 * price for a different condition, with no way to say so on the row.
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
  // pcbuilders consistently puts the warranty here ("3 YEARS WARRANTY"). Nothing
  // reads it yet.
  const warranty = product.short_description
    ? decodeEntities(product.short_description.replace(/<[^>]*>/g, '')).trim()
    : ''
  if (warranty) specs['Short description'] = warranty

  return Object.keys(specs).length > 0 ? specs : undefined
}

export function createWooScraper(config: WooConfig): Scraper {
  const api = `${config.baseUrl}/wp-json/wc/store/v1/products`
  const categories = Object.keys(config.categoryIds) as Category[]

  return {
    shop: config.shop,
    baseUrl: config.baseUrl,
    categories,

    async scrape(opts: ScrapeOptions = {}) {
      const log = opts.log ?? (() => {})
      const wanted = opts.categories?.length ? opts.categories : categories
      const rows: ScrapedRow[] = []

      for (const category of wanted) {
        for (const meta of [config.categoryIds[category] ?? []].flat()) {
          const found: ScrapedRow[] = []
          const maxPages = opts.maxPages ?? Infinity
          let page = 1

          // The Store API reports totals in headers the fetch helper does not
          // surface, so pagination stops on a short page instead.
          while (page <= maxPages) {
            const url = `${api}?category=${meta.id}&per_page=${PER_PAGE}&page=${page}`
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
              const name = product.name ? decodeEntities(product.name).trim() : ''
              if (!name) continue
              if (NOT_NEW.test(name)) continue

              const specs = toSpecs(product)
              const brand = config.brandAttribute ? specs?.[config.brandAttribute] : undefined
              const title =
                brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name

              const priceLkr = toRupees(product.prices?.price, product.prices?.currency_minor_unit)
              const listPriceLkr = toRupees(
                product.prices?.regular_price,
                product.prices?.currency_minor_unit,
              )

              // `is_in_stock` is true for backordered items too — over half of
              // pcbuilders' graphics cards are "Available on backorder" while
              // flagged in stock. Taking the flag at face value would have
              // advertised same-day availability for parts that have to be
              // ordered in.
              const onBackorder =
                product.is_on_backorder === true ||
                /backorder/i.test(product.stock_availability?.text ?? '')

              found.push({
                shop: config.shop,
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
                  brand: brand ?? null,
                  priceLkr,
                  listPriceLkr,
                  inStock: product.is_in_stock === true && !onBackorder,
                  preOrder: onBackorder,
                  imageUrl: product.images?.[0]?.src ?? null,
                  sku: product.sku || null,
                  stockText: product.stock_availability?.text ?? null,
                  specs,
                },
              })
            }

            if (batch.length < PER_PAGE) break
            page++
          }

          const capped = opts.maxProducts != null ? found.slice(0, opts.maxProducts) : found
          rows.push(...capped)
          log(`  ${category} (${meta.label}): ${capped.length} products`)
        }
      }

      return rows
    },
  }
}
