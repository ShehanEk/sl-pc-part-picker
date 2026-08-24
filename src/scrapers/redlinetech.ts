import * as cheerio from 'cheerio'

import { parseLkr } from '@/lib/http'

import { createTynoScraper, type TynoPriceInfo } from './tyno'

/**
 * redlinetech.lk — Tyno storefront, different theme to nanotek.lk.
 *
 * robots.txt disallows every query-string URL (`Disallow: /*?*`) and `*​/page/*`,
 * so `?page=N` is off limits: only the first page of each category is fetched.
 * See docs/retailers.md for what that costs us in coverage.
 */
function parsePrice(fragment: string): TynoPriceInfo {
  const $ = cheerio.load(fragment)

  const priceLkr = parseLkr($('.ty-product-page-price-holder p').first().text())

  // Each <li> labels the method either as text (CASH, BANK DEPOSIT) or as the
  // alt text of a card logo, with the amount in .ty-value .price.
  const pricesByMethod: Record<string, number> = {}
  $('.ty-product-page-payment-method-holder li').each((_, el) => {
    const method =
      $(el).find('.ty-img-holder p').first().text().trim() ||
      $(el).find('.ty-img-holder img').attr('alt')?.replace(/\s*icon\s*$/i, '').trim() ||
      ''
    const value = parseLkr($(el).find('.ty-value .price').first().text())
    if (method && value !== null) pricesByMethod[method] = value
  })

  const stockText = $('.ty-product-page-price-message')
    .first()
    .text()
    .trim()
    .toLowerCase()

  return {
    priceLkr,
    listPriceLkr: null,
    pricesByMethod,
    inStock: stockText ? stockText.includes('in stock') : null,
  }
}

export const redlinetech = createTynoScraper({
  shop: 'redlinetech.lk',
  baseUrl: 'https://www.redlinetech.lk',
  allowPagination: false, // robots.txt: Disallow: /*?*
  titleSelector: 'h1', // this theme has no cart-total <h1> above the product name
  categorySlugs: {
    gpu: 'graphics-card',
    psu: 'power-supply',
    cpu: 'processors',
    motherboard: 'motherboards',
    ram: 'memory-ram',
    storage: 'storage',
    case: 'cases',
  },
  parsePrice,
})
