import { politeGet } from '@/lib/http'

import type { Category, ScrapeOptions, ScrapedRow, Scraper } from './types'

/**
 * winsoft.lk — Laravel storefront.
 *
 * The most restricted robots.txt of the six, and the one that shaped everything
 * here. It disallows every query-string URL (`/*?*`, `/*&*`) **and** path
 * pagination (`*​/page/*`), so a category listing is capped at its first 12
 * products with no compliant way to page past them.
 *
 * Neither available source is complete on its own, and they do not contain each
 * other, so discovery is the union of both:
 *
 *   1. `/category/<slug>` — current, but only the first 12 per category.
 *   2. `sitemap.xml` — a wider set, but a stale one. Every `lastmod` in it is
 *      identical (2026-07-20), several of its URLs already 404, and of the 12
 *      graphics cards on the live category page only 5 appear in it.
 *
 * Both are plain paths, so nothing here touches a disallowed URL. Coverage is
 * still partial by construction — see docs/retailers.md. The way to more is to
 * ask the shop, not to fetch `?page=2`.
 *
 * Each product is then read from its own page, which carries a JSON-LD
 * `Product` block with price, category and a spec table, so no prices are
 * scraped out of markup.
 */
const BASE_URL = 'https://www.winsoft.lk'
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`

/** Canonical category → the shop's category slug, for listing discovery. */
const CATEGORY_SLUGS: Record<Category, string | null> = {
  gpu: 'graphics-card',
  cpu: 'processors',
  motherboard: 'motherboards',
  ram: 'memory-ram',
  storage: 'storage',
  psu: 'power-supply',
  case: 'cases',
}

/**
 * The shop's own category label → our canonical category.
 *
 * Keys are lower-cased and compared against the first segment of the JSON-LD
 * `category`, which is sometimes a path ("Storage > SSD"). Taking the first
 * segment maps sub-categories for free while leaving **External Storage**
 * unmapped, which is deliberate: it is where the shop files enclosures,
 * portable drives and — actually observed — a DVD rewriter.
 */
const CATEGORY_MAP: Record<string, Category> = {
  'graphics card': 'gpu',
  processors: 'cpu',
  motherboards: 'motherboard',
  'memory (ram)': 'ram',
  storage: 'storage',
  'power supply': 'psu',
  cases: 'case',
}

/**
 * Parts the shop will not sell on their own.
 *
 * The shop says this two ways — "(SYSTEM ONLY)" and "(Not Sold Separately)" —
 * and both mark a bundled-with-a-build price rather than one you can walk in
 * and pay. Listing either standalone would undercut every shop that will
 * actually sell you the part.
 *
 * Matching only the first phrasing let a "Crucial 32GB DDR5 5600MHz Desktop RAM
 * (Not Sold Separately)" through at a price nobody could pay for it alone. The
 * other three carrying that label happened to be laptop memory, which the
 * extractor rejects anyway — so one wrong phrasing was worth exactly one bad
 * row, and it took reading the rejected titles to notice.
 */
const NOT_SOLD_SEPARATELY = /\(\s*(?:system\s+only|not\s+sold\s+separately)\s*\)/i

type JsonLdProduct = {
  '@type'?: string
  name?: string
  sku?: string
  category?: string[] | string
  image?: ({ url?: string } | string)[]
  offers?: { price?: string; priceCurrency?: string; availability?: string }
  additionalProperty?: { name?: string; value?: string }[]
}

/** Product paths out of a sitemap or a category listing, deduped. */
export function productPaths(html: string): string[] {
  const paths = [...html.matchAll(/\/product\/[a-z0-9-]+/gi)].map((m) => m[0])
  return [...new Set(paths)]
}

export function parseProduct(html: string): JsonLdProduct | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block[1])
      for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
        const p = candidate as JsonLdProduct
        if (p && p['@type'] === 'Product') return p
      }
    } catch {
      // A malformed block is not a reason to abandon the page.
    }
  }
  return null
}

export function toCanonicalCategory(raw: JsonLdProduct['category']): Category | null {
  const first = Array.isArray(raw) ? raw[0] : raw
  if (!first) return null
  return CATEGORY_MAP[String(first).split('>')[0].trim().toLowerCase()] ?? null
}

function toProps(product: JsonLdProduct): Record<string, string> {
  const props: Record<string, string> = {}
  for (const p of product.additionalProperty ?? []) {
    if (p.name && p.value) props[p.name.trim()] = String(p.value).trim()
  }
  return props
}

export const winsoft: Scraper = {
  shop: 'winsoft.lk',
  baseUrl: BASE_URL,
  categories: Object.values(CATEGORY_MAP),

  async scrape(opts: ScrapeOptions = {}) {
    const log = opts.log ?? (() => {})
    const wanted = new Set<Category>(
      opts.categories?.length ? opts.categories : Object.values(CATEGORY_MAP),
    )

    const discovered = new Set<string>()

    // 1. Category listings: current, capped at whatever fits on page one.
    for (const category of wanted) {
      const slug = CATEGORY_SLUGS[category]
      if (!slug) continue
      const res = await politeGet(`${BASE_URL}/category/${slug}`)
      if (res.status !== 200) {
        log(`  category/${slug}: HTTP ${res.status}, skipping`)
        continue
      }
      const found = productPaths(res.body)
      found.forEach((p) => discovered.add(p))
      log(`  category/${slug}: ${found.length} products listed`)
    }

    // 2. The sitemap, for anything the listings' first page cut off.
    const sitemap = await politeGet(SITEMAP_URL)
    if (sitemap.status === 200) {
      const before = discovered.size
      productPaths(sitemap.body).forEach((p) => discovered.add(p))
      log(`  sitemap: added ${discovered.size - before} beyond the listings`)
    } else {
      log(`  sitemap: HTTP ${sitemap.status}, continuing on listings alone`)
    }

    const rows: ScrapedRow[] = []
    const perCategory = new Map<Category, number>()
    let missing = 0
    let offCatalogue = 0
    let bundleOnly = 0

    for (const path of discovered) {
      // The sitemap does not say what a product is, so a category can only be
      // known once the page has been read. `categories` narrows the output, not
      // the fetching.
      if (
        opts.maxProducts != null &&
        [...wanted].every((c) => (perCategory.get(c) ?? 0) >= opts.maxProducts!)
      ) {
        break
      }

      const res = await politeGet(`${BASE_URL}${path}`)
      if (res.status !== 200) {
        // Expected: the sitemap is months stale and lists products since pulled.
        missing++
        continue
      }

      const product = parseProduct(res.body)
      if (!product?.name) continue

      const category = toCanonicalCategory(product.category)
      if (!category || !wanted.has(category)) {
        offCatalogue++
        continue
      }
      if (opts.maxProducts != null && (perCategory.get(category) ?? 0) >= opts.maxProducts) {
        continue
      }

      const title = product.name.trim()
      if (NOT_SOLD_SEPARATELY.test(title)) {
        bundleOnly++
        continue
      }

      const props = toProps(product)
      const priceRaw = product.offers?.price
      const priceLkr = priceRaw != null && priceRaw !== '' ? Number(priceRaw) : null

      // `offers.availability` is hardcoded to OutOfStock on every product page
      // on this site, including ones the page itself renders as in stock with a
      // working Add to Cart. Believing it would have marked the whole shop out
      // of stock, which drops it out of the configurator entirely. The spec
      // table's own Availability row is the field that actually varies — its
      // casing does not, so the comparison is case-insensitive. Unstated stays
      // null rather than becoming a claim either way.
      const availability = props.Availability ?? ''
      const inStock = availability
        ? /^\s*in\s*stock\s*$/i.test(availability)
        : null

      const image = product.image?.[0]

      rows.push({
        shop: 'winsoft.lk',
        sourceUrl: `${BASE_URL}${path}`,
        rawTitle: title,
        rawPriceText:
          priceRaw != null ? `${product.offers?.priceCurrency ?? 'LKR'} ${priceRaw}` : null,
        payload: {
          category,
          retailerCategory: Array.isArray(product.category)
            ? product.category.join(', ')
            : String(product.category ?? ''),
          externalId: product.sku ?? null,
          brand: props.Brand ?? null,
          priceLkr: priceLkr !== null && Number.isFinite(priceLkr) ? priceLkr : null,
          inStock,
          imageUrl: typeof image === 'string' ? image : (image?.url ?? null),
          specs: Object.keys(props).length > 0 ? props : undefined,
        },
      })
      perCategory.set(category, (perCategory.get(category) ?? 0) + 1)
    }

    for (const [category, n] of perCategory) log(`  ${category}: ${n} products`)
    log(
      `  skipped ${offCatalogue} outside our categories, ${missing} gone from the site` +
        (bundleOnly ? `, ${bundleOnly} sold only with a system` : ''),
    )

    return rows
  },
}
