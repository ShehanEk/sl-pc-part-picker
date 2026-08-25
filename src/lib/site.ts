import type { BuildSlot } from '@/compat/build'

/**
 * Site identity, used by metadata, canonical URLs, the sitemap and JSON-LD.
 *
 * The absolute origin has to be known at build time, because canonical URLs and
 * sitemap entries cannot be relative. On Vercel the production domain is
 * supplied automatically, so nothing needs configuring until there is a custom
 * domain — at which point set NEXT_PUBLIC_SITE_URL, or every canonical will
 * keep pointing at the vercel.app host and split the ranking between two names.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
).replace(/\/$/, '')

export const SITE_NAME = 'PC Maker.lk'

export const canonical = (path: string) => `${SITE_URL}${path}`

/**
 * Per-category wording for the browse pages.
 *
 * `heading` leads the title and the H1, and is the noun a person actually
 * types — "graphics card price sri lanka", never "gpu price sri lanka". It is
 * singular because the title reads "Graphics card prices"; `plural` is for
 * running text and breadcrumbs, where "power supplies" is the natural form.
 *
 * `blurb` gives each page a paragraph of its own rather than seven
 * near-identical ones, which is the difference between seven indexed pages and
 * one indexed page plus six treated as duplicates of it.
 */
export const CATEGORY_COPY: Record<
  BuildSlot,
  { heading: string; plural: string; singular: string; blurb: string }
> = {
  gpu: {
    heading: 'Graphics card',
    plural: 'graphics cards',
    singular: 'graphics card',
    blurb:
      'Every graphics card we can find in stock in Sri Lanka, with the cheapest local price for each and which shop has it. Prices are checked daily.',
  },
  cpu: {
    heading: 'Processor',
    plural: 'processors',
    singular: 'processor',
    blurb:
      'Desktop processors available in Sri Lanka, with local prices and the socket each one needs, so you can match a motherboard to it.',
  },
  motherboard: {
    heading: 'Motherboard',
    plural: 'motherboards',
    singular: 'motherboard',
    blurb:
      'Motherboards in stock in Sri Lanka, listed with their socket and memory generation so you can check a processor and memory fit before you buy.',
  },
  ram: {
    heading: 'RAM',
    plural: 'RAM',
    singular: 'memory kit',
    blurb:
      'Desktop DDR4 and DDR5 memory available in Sri Lanka, with capacity, speed and the cheapest local price for each kit.',
  },
  storage: {
    heading: 'SSD and hard drive',
    plural: 'SSDs and hard drives',
    singular: 'drive',
    blurb:
      'NVMe, M.2 SATA and 2.5-inch SATA drives in stock in Sri Lanka, with capacity and the cheapest local price for each.',
  },
  psu: {
    heading: 'Power supply',
    plural: 'power supplies',
    singular: 'power supply',
    blurb:
      'Power supplies available in Sri Lanka, with rated wattage and efficiency rating, so you can size one against the card you are buying.',
  },
  case: {
    heading: 'PC case',
    plural: 'PC cases',
    singular: 'case',
    blurb:
      'PC cases in stock in Sri Lanka, with the largest motherboard size each one accepts and the cheapest local price.',
  },
}

/** The shops we track, named in copy so the page says who the prices come from. */
export const TRACKED_SHOPS = [
  'nanotek.lk',
  'redlinetech.lk',
  'gamestreet.lk',
  'chamacomputers.lk',
] as const

export const rupees = (n: number) => `Rs ${Math.round(n).toLocaleString('en-LK')}`
