import * as cheerio from 'cheerio'

import { parseLkr } from '@/lib/http'

import { createTynoScraper, type TynoPriceInfo } from './tyno'

/**
 * nanotek.lk — Tyno storefront.
 *
 * robots.txt only disallows /admin, so pagination is fine.
 *
 * Prices are per payment method (cash / bank / card / BNPL). The cash price is
 * the lowest and is what the shop markets as the real price, so it is taken as
 * the headline price; the rest are kept in the payload.
 */
function parsePrice(fragment: string): TynoPriceInfo {
  const $ = cheerio.load(fragment)

  const pricesByMethod: Record<string, number> = {}
  $('.ty-payment-method-blocks-list li').each((_, el) => {
    const method =
      $(el).find('img').attr('alt')?.replace(/\s*icon\s*$/i, '').trim() ||
      `method-${Object.keys(pricesByMethod).length + 1}`
    const value = parseLkr($(el).find('.ty-pay-price span').first().text())
    if (value !== null) pricesByMethod[method] = value
  })

  const values = Object.values(pricesByMethod)
  const listPriceLkr = parseLkr(
    $('.ty-vs-price span').first().text() || null,
  )

  const stockText = $('.ty-special-msg').first().text().trim().toLowerCase()

  return {
    priceLkr: values.length ? Math.min(...values) : null,
    listPriceLkr,
    pricesByMethod,
    inStock: stockText ? stockText.includes('in stock') : null,
  }
}

export const nanotek = createTynoScraper({
  shop: 'nanotek.lk',
  baseUrl: 'https://www.nanotek.lk',
  allowPagination: true,
  // NOT a bare `h1`: the cart-total <h1 class="ty-quoteValue"> comes first in the DOM.
  titleSelector: 'h1.ty-productTitle',
  categorySlugs: {
    gpu: 'graphics-card',
    psu: 'power-supply-ups-surge-protectors',
    cpu: 'processor',
    motherboard: 'motherboards',
    ram: 'memory-ram',
  },
  parsePrice,
})
