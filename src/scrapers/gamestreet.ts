import * as cheerio from 'cheerio'

import { parseLkr, politeGet } from '@/lib/http'

import type { Category, ScrapeOptions, ScrapedRow, Scraper } from './types'

/**
 * gamestreet.lk — plain PHP storefront.
 *
 * The cheapest of the four to scrape: category listings are server-rendered with
 * title, brand and price together, and there is no pagination — one request per
 * category returns the whole listing.
 *
 * Category ids are base64 in the query string (`?cat=Mg==&scat=Ng==` → 2/6).
 * Its robots.txt carries only Cloudflare's content-signal boilerplate with no
 * directives, so nothing is disallowed.
 */
const BASE_URL = 'https://www.gamestreet.lk'

/** cat=2 is "Components"; scat picks the component type. */
const CATEGORY_IDS: Partial<Record<Category, { cat: number; scat: number; label: string }>> = {
  gpu: { cat: 2, scat: 6, label: 'GRAPHIC CARD' },
  psu: { cat: 2, scat: 5, label: 'POWER SUPPLY' },
  cpu: { cat: 2, scat: 1, label: 'PROCESSOR' },
  motherboard: { cat: 2, scat: 2, label: 'MOTHERBOARD' },
  ram: { cat: 2, scat: 3, label: 'MEMORY' },
  storage: { cat: 2, scat: 13, label: 'SSD' },
  case: { cat: 2, scat: 4, label: 'COMPUTER CASE' },
}

const b64 = (n: number) => Buffer.from(String(n), 'utf8').toString('base64')

export const gamestreet: Scraper = {
  shop: 'gamestreet.lk',
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

      const url = `${BASE_URL}/products.php?cat=${b64(meta.cat)}&scat=${b64(meta.scat)}`
      const res = await politeGet(url)
      if (res.status !== 200) {
        log(`  ${category}: HTTP ${res.status}, skipping`)
        continue
      }

      const $ = cheerio.load(res.body)
      const seen = new Set<string>()
      const found: ScrapedRow[] = []

      $('.product_content').each((_, el) => {
        const card = $(el)
        const link = card.find('.product_title a').first()
        const href = link.attr('href')
        const title = link.text().trim()
        if (!href || !title) return

        // The listing repeats each product (grid + carousel), so dedupe by id.
        const externalId =
          card.find('[data-id]').first().attr('data-id') ??
          href.split('pid=')[1] ??
          href
        if (seen.has(externalId)) return
        seen.add(externalId)

        const priceText = card.find('.redPrice').first().text().trim() || null

        found.push({
          shop: 'gamestreet.lk',
          sourceUrl: new URL(href, BASE_URL).toString(),
          rawTitle: title,
          rawPriceText: priceText,
          payload: {
            category,
            retailerCategory: meta.label,
            externalId,
            brand: card.find('.product_brand').first().text().trim() || null,
            priceLkr: parseLkr(priceText),
            listPriceLkr: null,
            // The listing has no stock indicator; the product page does.
            inStock: null,
          },
        })
      })

      const kept = opts.maxProducts ? found.slice(0, opts.maxProducts) : found
      rows.push(...kept)
      log(`  ${category} (${meta.label}): ${kept.length} products`)
    }

    return rows
  },
}
