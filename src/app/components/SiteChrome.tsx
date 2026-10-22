import Link from 'next/link'

import { CATEGORIES, CATEGORY_COPY, SITE_NAME, TRACKED_SHOPS } from '@/lib/site'
import { getCatalogStats } from '@/queries/build'

import { CaseIcon } from './PartIcons'
import { SearchBox } from './SearchBox'

/**
 * Header and footer shared by every page.
 *
 * The footer is not decoration: it is the crawl path. Part pages are only
 * reachable through a category page, and a category page is only reachable from
 * here, so without these links most of the site would be orphaned and never
 * indexed however good the sitemap is.
 */

export async function SiteHeader({ search = true }: { search?: boolean }) {
  const stats = await getCatalogStats()

  const checked = stats.lastScrape
    ? new Date(stats.lastScrape).toLocaleString('en-GB', {
        timeZone: 'Asia/Colombo',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null

  return (
    <header className="glass-header sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3 sm:px-8">
      <div className="flex items-baseline gap-3">
        <Link href="/" className="text-[17.5px] font-bold tracking-[-0.025em]">
          PCPrice<span className="text-accent">.lk</span>
        </Link>
        <span className="hidden text-[12.5px] text-ink-3 md:inline">PC part prices, Sri Lanka</span>
      </div>

      {search && (
        <div className="order-last w-full sm:order-none sm:w-auto sm:max-w-[520px] sm:flex-1">
          <SearchBox />
        </div>
      )}

      <div className="flex items-center gap-2">
        {checked && (
          <span className="mono hidden items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-white/90 px-3 py-1.5 text-[11px] text-ink-3 lg:flex">
            <span
              className="h-1.5 w-1.5 rounded-full bg-ok"
              style={{ boxShadow: '0 0 8px oklch(0.75 0.18 152)' }}
            />
            Checked {checked}
          </span>
        )}
        <Link
          href="/deals"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-3 text-[14px] font-semibold text-ink-2 transition hover:bg-white/70 hover:text-ink"
        >
          Deals
        </Link>
        {/* Secondary on purpose: the site is for finding a price, and the
            builder is for the people who want a whole machine. */}
        <Link
          href="/build"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[rgb(90_130_230/40%)] bg-[rgb(120_160_255/16%)] px-4 text-[14px] font-semibold text-[var(--accent-strong)] shadow-[0_4px_14px_-8px_rgb(47_109_211/50%)] transition hover:border-[var(--accent)] hover:bg-[rgb(120_160_255/24%)]"
        >
          <CaseIcon className="h-[18px] w-[18px]" />
          Build a PC
        </Link>
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
            {CATEGORIES.map((slot) => (
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
                href="/build"
                className="text-[13.5px] text-ink-2 underline-offset-2 hover:text-accent hover:underline"
              >
                PC builder
              </Link>
            </li>
          </ul>
        </nav>

        <p className="mt-5 max-w-[70ch] text-[12px] leading-relaxed text-ink-4">
          {SITE_NAME} tracks prices at {TRACKED_SHOPS.join(', ')} and checks that the parts you
          pick work together. Prices are scraped daily and shown in Sri Lankan rupees; confirm
          with the shop before buying, as stock and prices change between our checks.{' '}
          <Link href="/privacy" className="text-ink-3 underline underline-offset-2 hover:text-accent">
            Privacy
          </Link>
        </p>
      </div>
    </footer>
  )
}
