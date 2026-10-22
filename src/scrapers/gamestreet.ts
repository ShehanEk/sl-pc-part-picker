import * as cheerio from 'cheerio'

import { parseLkr, politeGet } from '@/lib/http'

import type { Category, ScrapeOptions, ScrapedRow, Scraper } from './types'

/**
 * gamestreet.lk — plain PHP storefront.
 *
 * Category listings are server-rendered with title, brand and price together,
 * and there is no pagination — one request per category returns the whole
 * listing. Stock is only on the product page, so each product costs one more
 * request.
 *
 * Category ids are base64 in the query string (`?cat=Mg==&scat=Ng==` → 2/6).
 * Its robots.txt carries only Cloudflare's content-signal boilerplate with no
 * directives, so nothing is disallowed.
 */
const BASE_URL = 'https://www.gamestreet.lk'

type CategoryId = { cat: number; scat: number; label: string }

/** Mostly cat=2, "Components"; cat=6 is "Peripherals". */
const CATEGORY_IDS: Partial<Record<Category, CategoryId | CategoryId[]>> = {
  gpu: { cat: 2, scat: 6, label: 'GRAPHIC CARD' },
  psu: { cat: 2, scat: 5, label: 'POWER SUPPLY' },
  cpu: { cat: 2, scat: 1, label: 'PROCESSOR' },
  motherboard: { cat: 2, scat: 2, label: 'MOTHERBOARD' },
  ram: { cat: 2, scat: 3, label: 'MEMORY' },
  storage: { cat: 2, scat: 13, label: 'SSD' },
  case: { cat: 2, scat: 4, label: 'COMPUTER CASE' },
  // Not scat=0, the whole of cat=6: that mixes in drives, headsets and webcams.
  peripherals: [
    { cat: 6, scat: 16, label: 'KEYBOARD' },
    { cat: 6, scat: 17, label: 'MOUSE' },
    { cat: 6, scat: 30, label: 'CONTROLLER' },
  ],
  laptops: { cat: 1, scat: 0, label: 'LAPTOPS' },
}

const b64 = (n: number) => Buffer.from(String(n), 'utf8').toString('base64')

/**
 * Stock, from the product page's `dl.ProInfo` table ("» Stock Availability").
 *
 * The listing carries no stock at all, and the normalizer reads unknown as in
 * stock — which had every gamestreet part advertised as available. The raw text
 * is returned alongside, so wording not seen yet shows up in the payload rather
 * than being guessed at.
 */
export function parseStock(html: string): { inStock: boolean | null; stockText: string | null } {
  const $ = cheerio.load(html)
  const dt = $('dl.ProInfo dt')
    .filter((_, el) => /stock\s+availability/i.test($(el).text()))
    .first()
  const stockText = dt.length ? dt.nextAll('dd').first().text().trim() || null : null
  return {
    inStock: stockText ? /^in\s*stock$/i.test(stockText) : null,
    stockText,
  }
}

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
      for (const meta of [CATEGORY_IDS[category] ?? []].flat()) {

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
              // Filled from the product page below.
              inStock: null,
            },
          })
        })

        const kept = opts.maxProducts ? found.slice(0, opts.maxProducts) : found

        // One product page per row, for stock. A failed page keeps the row with
        // its listing price and stock unknown — no worse than before this existed.
        let unknown = 0
        for (const row of kept) {
          try {
            const page = await politeGet(row.sourceUrl)
            if (page.status === 200) Object.assign(row.payload, parseStock(page.body))
          } catch (err) {
            log(`  ! ${row.sourceUrl}: ${err instanceof Error ? err.message : err}`)
          }
          if (row.payload.inStock == null) unknown++
        }

        rows.push(...kept)
        log(
          `  ${category} (${meta.label}): ${kept.length} products` +
            (unknown ? `, stock unknown for ${unknown}` : ''),
        )
      }
    }

    return rows
  },
}
