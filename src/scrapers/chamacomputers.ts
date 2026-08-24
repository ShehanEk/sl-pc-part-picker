import { politeGet } from '@/lib/http'

import type { Category, ScrapeOptions, ScrapedRow, Scraper } from './types'

/**
 * chamacomputers.lk — Next.js storefront backed by Sanity.
 *
 * The best-structured of the four: product objects are embedded verbatim in the
 * React Server Component flight payload, so no HTML parsing is needed. They are
 * escaped inside `self.__next_f.push([1, "..."])` string chunks, so the escaping
 * is undone before the objects are pulled out.
 *
 * robots.txt allows everything except /api, /privacy, /cart and /survey. Product
 * data comes from the page itself, not /api, so scraping stays within it.
 */
const BASE_URL = 'https://chamacomputers.lk'

const CATEGORY_PATHS: Partial<Record<Category, string>> = {
  gpu: 'graphics cards',
  psu: 'power supply',
  cpu: 'processors',
  motherboard: 'motherboards',
  ram: 'memory',
  storage: 'ssd',
  case: 'pc cases',
}

type ChamaProduct = {
  id: number
  name: string
  category?: { id: number; name: string }
  instock?: boolean
  price?: number
  undiscountedPrice?: number
  discount?: number
  image?: string
  active?: boolean
  preOrder?: boolean
  quantity?: number
}

/**
 * Pull `"product":{...}` objects out of the flight payload.
 * Brace-matched rather than regex-terminated, since the objects nest.
 */
export function extractProducts(html: string): ChamaProduct[] {
  // The payload is JS string literals: \" for quotes, \\ for backslashes.
  const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  const products: ChamaProduct[] = []
  const marker = '"product":{'

  let index = unescaped.indexOf(marker)
  while (index !== -1) {
    const start = index + marker.length - 1
    let depth = 0
    let end = -1

    for (let i = start; i < unescaped.length; i++) {
      const ch = unescaped[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }

    if (end === -1) break
    try {
      const parsed = JSON.parse(unescaped.slice(start, end + 1)) as ChamaProduct
      if (parsed && typeof parsed.id === 'number' && parsed.name) products.push(parsed)
    } catch {
      // A chunk boundary can split an object; skip it rather than fail the run.
    }
    index = unescaped.indexOf(marker, end === -1 ? index + marker.length : end)
  }

  return products
}

export const chamacomputers: Scraper = {
  shop: 'chamacomputers.lk',
  baseUrl: BASE_URL,
  categories: Object.keys(CATEGORY_PATHS) as Category[],

  async scrape(opts: ScrapeOptions = {}) {
    const log = opts.log ?? (() => {})
    const wanted = opts.categories?.length
      ? opts.categories
      : (Object.keys(CATEGORY_PATHS) as Category[])
    const rows: ScrapedRow[] = []

    for (const category of wanted) {
      const path = CATEGORY_PATHS[category]
      if (!path) continue

      const seen = new Set<number>()
      const maxPages = opts.maxPages ?? 30

      for (let page = 1; page <= maxPages; page++) {
        const url =
          page === 1
            ? `${BASE_URL}/products/${encodeURIComponent(path)}`
            : `${BASE_URL}/products/${encodeURIComponent(path)}?page=${page}`

        const res = await politeGet(url)
        if (res.status !== 200) break

        const products = extractProducts(res.body).filter((p) => !seen.has(p.id))
        if (products.length === 0) break // no new products → past the last page

        for (const p of products) {
          seen.add(p.id)
          rows.push({
            shop: 'chamacomputers.lk',
            sourceUrl: `${BASE_URL}/products/${encodeURIComponent(path)}/${encodeURIComponent(
              p.name.toLowerCase(),
            )}`,
            rawTitle: p.name,
            rawPriceText: p.price != null ? String(p.price) : null,
            payload: {
              category,
              retailerCategory: p.category?.name ?? path,
              externalId: String(p.id),
              priceLkr: p.price ?? null,
              listPriceLkr: p.undiscountedPrice ?? null,
              inStock: p.instock ?? null,
              preOrder: p.preOrder ?? null,
              imageUrl: p.image ?? null,
              quantity: p.quantity ?? null,
              discount: p.discount ?? null,
            },
          })
        }

        if (opts.maxProducts && seen.size >= opts.maxProducts) break
      }

      log(`  ${category} (${path}): ${seen.size} products`)
    }

    return rows
  },
}
