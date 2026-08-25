import { chamacomputers } from './chamacomputers'
import { gamestreet } from './gamestreet'
import { nanotek } from './nanotek'
import { pcbuilders } from './pcbuilders'
import { redlinetech } from './redlinetech'

import type { Scraper } from './types'

export const scrapers: Record<string, Scraper> = {
  'nanotek.lk': nanotek,
  'redlinetech.lk': redlinetech,
  'gamestreet.lk': gamestreet,
  'chamacomputers.lk': chamacomputers,
  'pcbuilders.lk': pcbuilders,
}

export const shopKeys = Object.keys(scrapers)

export function getScraper(shop: string): Scraper {
  const scraper = scrapers[shop]
  if (!scraper) {
    throw new Error(`Unknown shop "${shop}". Known: ${shopKeys.join(', ')}`)
  }
  return scraper
}

export * from './types'
