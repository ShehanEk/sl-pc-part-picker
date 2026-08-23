import * as cheerio from 'cheerio'

import { politeGet } from '@/lib/http'

import type { Category, ScrapeOptions, ScrapedRow, Scraper } from './types'

/**
 * nanotek.lk and redlinetech.lk run the same underlying storefront (both built
 * by callmetyno.com), so they share a fetch flow:
 *
 *   1. GET /category/{slug}          → product URLs (no prices in the HTML)
 *   2. GET /product/{slug}           → product id + title
 *   3. GET /product/{id}/variants/0  → price + stock  (JSON-encoded HTML)
 *   4. GET /product/{id}/variants/0/description → manufacturer spec table
 *
 * Only the fetch flow is shared. Each retailer supplies its own parsers, because
 * the two run different themes and a redesign on one must not break the other.
 */

export type TynoPriceInfo = {
  priceLkr: number | null
  listPriceLkr: number | null
  pricesByMethod: Record<string, number>
  inStock: boolean | null
}

export type TynoConfig = {
  shop: string
  baseUrl: string
  /** Canonical category → the retailer's category slug. */
  categorySlugs: Partial<Record<Category, string>>
  /**
   * Selector for the product title. Theme-specific and easy to get wrong:
   * both themes put an unrelated <h1> (the cart total) above the product name,
   * so a bare `h1` is only correct where the theme has no such header.
   */
  titleSelector: string
  /**
   * Whether `?page=N` may be fetched. redlinetech.lk's robots.txt disallows all
   * query-string URLs, so it is limited to the first page of each category.
   */
  allowPagination: boolean
  /** Theme-specific parse of the /variants/0 fragment. */
  parsePrice(fragment: string): TynoPriceInfo
}

/**
 * Unwrap a variants-endpoint response into HTML.
 *
 * The two endpoints disagree on shape: /variants/0 returns a bare JSON string
 * ("<div>…"), while /variants/0/description returns an object
 * ({"description":"<div>…"}). Feeding the undecoded JSON to cheerio silently
 * "works" — it parses the escaped markup into junk nodes — so this must handle
 * both rather than falling through.
 */
export function decodeFragment(body: string): string {
  const trimmed = body.trim()
  if (!trimmed.startsWith('"') && !trimmed.startsWith('{')) return trimmed

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const candidate = obj.description ?? obj.html ?? obj.content
      if (typeof candidate === 'string') return candidate
    }
  } catch {
    // Not JSON after all — fall through and treat it as raw HTML.
  }
  return trimmed
}

/** Pull the manufacturer spec table out of the description fragment. */
export function parseSpecTable(fragment: string): Record<string, string> {
  const $ = cheerio.load(fragment)
  const specs: Record<string, string> = {}

  $('.rowTableTitle').each((_, el) => {
    const key = $(el).text().trim()
    // The value sits in the sibling ".rowTableItems" of the enclosing row.
    const value = $(el)
      .closest('[class*="rowTable__"]')
      .find('[class*="rowTableItems"]')
      .map((__, v) => $(v).text().trim())
      .get()
      .filter(Boolean)
      .join(' | ')
    if (key && value) specs[key] = value
  })

  return specs
}

export function createTynoScraper(config: TynoConfig): Scraper {
  const categories = Object.keys(config.categorySlugs) as Category[]

  async function collectProductUrls(
    slug: string,
    maxPages: number,
    log: (m: string) => void,
  ): Promise<string[]> {
    const urls = new Set<string>()
    const pageLimit = config.allowPagination ? maxPages : 1

    for (let page = 1; page <= pageLimit; page++) {
      const url =
        page === 1
          ? `${config.baseUrl}/category/${slug}`
          : `${config.baseUrl}/category/${slug}?page=${page}`

      const res = await politeGet(url)
      if (res.status !== 200) {
        log(`  category ${slug} page ${page} → HTTP ${res.status}, stopping`)
        break
      }

      const $ = cheerio.load(res.body)
      const before = urls.size
      $(`a[href*="/product/"]`).each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        const abs = new URL(href, config.baseUrl).toString().split('?')[0]
        // Skip helper routes like /product/compare.
        if (/\/product\/[^/]+$/.test(abs) && !abs.endsWith('/compare')) {
          urls.add(abs)
        }
      })

      if (urls.size === before) break // page added nothing new → end of listing
    }

    if (!config.allowPagination) {
      log(`  ${slug}: pagination disallowed by robots.txt, first page only`)
    }
    return [...urls]
  }

  async function scrapeProduct(
    productUrl: string,
    category: Category,
    slug: string,
  ): Promise<ScrapedRow | null> {
    const page = await politeGet(productUrl)
    if (page.status !== 200) return null

    const $ = cheerio.load(page.body)
    const productId = $('[data-product-id]').first().attr('data-product-id')
    const title =
      $(config.titleSelector).first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      ''

    if (!productId || !title) return null

    // Price + stock live behind an XHR. No query string: redlinetech.lk's
    // robots.txt disallows those, and the endpoint works without the CSRF token.
    const variants = await politeGet(
      `${config.baseUrl}/product/${productId}/variants/0`,
      { ajax: true, cookie: page.cookie ?? undefined },
    )
    const priceInfo =
      variants.status === 200
        ? config.parsePrice(decodeFragment(variants.body))
        : { priceLkr: null, listPriceLkr: null, pricesByMethod: {}, inStock: null }

    let specs: Record<string, string> = {}
    const description = await politeGet(
      `${config.baseUrl}/product/${productId}/variants/0/description`,
      { ajax: true, cookie: page.cookie ?? undefined },
    )
    if (description.status === 200) {
      specs = parseSpecTable(decodeFragment(description.body))
    }

    return {
      shop: config.shop,
      sourceUrl: productUrl,
      rawTitle: title,
      rawPriceText: priceInfo.priceLkr !== null ? String(priceInfo.priceLkr) : null,
      payload: {
        category,
        retailerCategory: slug,
        externalId: productId,
        priceLkr: priceInfo.priceLkr,
        listPriceLkr: priceInfo.listPriceLkr,
        pricesByMethod: priceInfo.pricesByMethod,
        inStock: priceInfo.inStock,
        imageUrl: $('meta[property="og:image"]').attr('content') ?? null,
        ...(Object.keys(specs).length ? { specs } : {}),
      },
    }
  }

  return {
    shop: config.shop,
    baseUrl: config.baseUrl,
    categories,

    async scrape(opts: ScrapeOptions = {}) {
      const log = opts.log ?? (() => {})
      const wanted = opts.categories?.length ? opts.categories : categories
      const rows: ScrapedRow[] = []

      for (const category of wanted) {
        const slug = config.categorySlugs[category]
        if (!slug) continue

        const urls = await collectProductUrls(slug, opts.maxPages ?? 20, log)
        const capped = opts.maxProducts ? urls.slice(0, opts.maxProducts) : urls
        log(`  ${category} (${slug}): ${capped.length} products`)

        for (const url of capped) {
          try {
            const row = await scrapeProduct(url, category, slug)
            if (row) rows.push(row)
          } catch (err) {
            log(`  ! ${url}: ${err instanceof Error ? err.message : err}`)
          }
        }
      }

      return rows
    },
  }
}
