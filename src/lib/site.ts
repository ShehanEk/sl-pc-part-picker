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

/**
 * The shops we track, named in copy so the page says who the prices come from.
 *
 * Keep this in step with `src/scrapers/index.ts` — it is rendered in the public
 * footer and in the homepage meta description, so a shop missing here is a shop
 * the site tells people it does not cover.
 */
export const TRACKED_SHOPS = [
  'nanotek.lk',
  'redlinetech.lk',
  'gamestreet.lk',
  'chamacomputers.lk',
  'pcbuilders.lk',
  'winsoft.lk',
] as const

/**
 * When each shop is expected to have run, from the caller workflows in
 * `.github/workflows/`. The admin dashboard compares a shop's last landed row
 * against this to tell "quiet because nothing changed" from "quiet because it
 * has stopped working".
 *
 * Hours are UTC, matching the cron expressions; Sri Lanka is UTC+5:30.
 */
export const SHOP_SCHEDULE: Record<string, { cronUtc: string; localLabel: string }> = {
  'winsoft.lk': { cronUtc: '30 18 * * *', localLabel: '00:00' },
  'nanotek.lk': { cronUtc: '0 19 * * *', localLabel: '00:30' },
  'redlinetech.lk': { cronUtc: '30 19 * * *', localLabel: '01:00' },
  'gamestreet.lk': { cronUtc: '0 20 * * *', localLabel: '01:30' },
  'chamacomputers.lk': { cronUtc: '30 20 * * *', localLabel: '02:00' },
  'pcbuilders.lk': { cronUtc: '0 21 * * *', localLabel: '02:30' },
}

/** Hours since a shop's expected daily run, given "HH" from its cron. */
export function hoursSinceExpectedRun(cronUtc: string, now = new Date()): number {
  const [minute, hour] = cronUtc.split(' ').map(Number)
  const expected = new Date(now)
  expected.setUTCHours(hour, minute, 0, 0)
  // Today's slot has not come round yet, so measure from yesterday's.
  if (expected > now) expected.setUTCDate(expected.getUTCDate() - 1)
  return (now.getTime() - expected.getTime()) / 3_600_000
}

export const rupees = (n: number) => `Rs ${Math.round(n).toLocaleString('en-LK')}`
