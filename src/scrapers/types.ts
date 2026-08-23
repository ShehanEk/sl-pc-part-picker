import type { categoryEnum } from '@/db/schema'

export type Category = (typeof categoryEnum.enumValues)[number]

/**
 * Everything a scraper emits. Deliberately dumb: no canonical part matching, no
 * spec parsing, no unit conversion. Anything the page offers that might help the
 * normalizer goes into `payload` verbatim so ingest can be reprocessed without
 * re-scraping.
 */
export type ScrapedRow = {
  shop: string
  sourceUrl: string
  rawTitle: string
  rawPriceText: string | null
  payload: {
    /** Our canonical category this listing was discovered under. */
    category: Category
    /** The retailer's own category label, kept for debugging bad mappings. */
    retailerCategory: string
    /** The retailer's internal product id, if exposed. */
    externalId?: string | null
    brand?: string | null
    priceLkr?: number | null
    /** Retailers that price per payment method (Tyno sites) put them all here. */
    pricesByMethod?: Record<string, number>
    /** Undiscounted / "retail" price where the retailer shows one. */
    listPriceLkr?: number | null
    inStock?: boolean | null
    preOrder?: boolean | null
    imageUrl?: string | null
    /** Manufacturer spec table, when the product page carries one. */
    specs?: Record<string, string>
    [key: string]: unknown
  }
}

export type ScrapeOptions = {
  /** Restrict to these canonical categories. Defaults to the scraper's full set. */
  categories?: Category[]
  /** Cap pages fetched per category. Used by smoke tests to keep runs short. */
  maxPages?: number
  /** Cap products per category. Mainly for smoke tests. */
  maxProducts?: number
  log?: (msg: string) => void
}

export type Scraper = {
  /** Stable shop key stored on every row. */
  shop: string
  baseUrl: string
  /** Canonical categories this retailer is mapped for. */
  categories: Category[]
  scrape(opts?: ScrapeOptions): Promise<ScrapedRow[]>
}
