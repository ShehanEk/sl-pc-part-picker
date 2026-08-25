import Link from 'next/link'

import { BUILD_SLOTS } from '@/compat/build'
import { CATEGORY_COPY, SITE_NAME, TRACKED_SHOPS } from '@/lib/site'
import { getCatalogStats } from '@/queries/build'

/**
 * Header and footer shared by every page.
 *
 * The footer is not decoration: it is the crawl path. Part pages are only
 * reachable through a category page, and a category page is only reachable from
 * here, so without these links most of the site would be orphaned and never
 * indexed however good the sitemap is.
 */

const nf = new Intl.NumberFormat('en-LK')

export async function SiteHeader() {
  const stats = await getCatalogStats()

  const checked = stats.lastScrape
    ? new Date(stats.lastScrape).toLocaleString('en-LK', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null

  return (
    <header className="glass-header sticky top-0 z-30 flex items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
      <div className="flex items-baseline gap-3">
        <Link href="/" className="text-[17.5px] font-bold tracking-[-0.025em]">
          PC Maker<span className="text-accent">.lk</span>
        </Link>
        <span className="hidden text-[12.5px] text-ink-3 sm:inline">
          PC prices &amp; stock, Sri Lanka
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="mono hidden items-center gap-4 px-1 py-1.5 text-[11px] text-ink-3 lg:flex">
          <span>{nf.format(stats.parts)} parts</span>
          <span>{nf.format(stats.listings)} listings</span>
          <span>{stats.shops} shops</span>
        </span>
        {checked && (
          <span className="mono flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-white/90 px-3 py-1.5 text-[11px] text-ink-3">
            <span
              className="h-1.5 w-1.5 rounded-full bg-ok"
              style={{ boxShadow: '0 0 8px oklch(0.75 0.18 152)' }}
            />
            live {checked}
          </span>
        )}
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[1300px] px-5 pb-16 pt-4 sm:px-8">
      <div className="glass px-6 py-6">
        <nav aria-label="Browse by category">
          <h2 className="eyebrow mb-3">Browse prices in Sri Lanka</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {BUILD_SLOTS.map((slot) => (
              <li key={slot}>
                <Link
                  href={`/${slot}`}
                  className="text-[13.5px] text-ink-2 underline-offset-2 hover:text-accent hover:underline"
                >
                  {CATEGORY_COPY[slot].plural}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/"
                className="text-[13.5px] text-ink-2 underline-offset-2 hover:text-accent hover:underline"
              >
                Build a PC
              </Link>
            </li>
          </ul>
        </nav>

        <p className="mt-5 max-w-[70ch] text-[12px] leading-relaxed text-ink-4">
          {SITE_NAME} tracks prices at {TRACKED_SHOPS.join(', ')} and checks that the parts you
          pick work together. Prices are scraped daily and shown in Sri Lankan rupees; confirm
          with the shop before buying, as stock and prices change between our checks.
        </p>
      </div>
    </footer>
  )
}
