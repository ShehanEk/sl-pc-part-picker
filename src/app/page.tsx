import type { Metadata } from 'next'
import Link from 'next/link'

import { CATEGORY_STYLE, CaseIcon } from './components/PartIcons'
import { SearchBox } from './components/SearchBox'
import { SiteFooter, SiteHeader } from './components/SiteChrome'

import { CATEGORIES, type Category, CATEGORY_COPY, SITE_NAME, TRACKED_SHOPS, canonical, rupees, sentenceCase } from '@/lib/site'
import { findDeals, toDealItems } from '@/lib/deals'
import { shopStats } from '@/lib/shop-stats'
import { loadDirectory, loadPriceIndex } from '@/queries/seo'

import { DealCard } from './components/Deals'
import { ShopProfiles } from './components/ShopProfiles'

/**
 * Home: pick a category, pick the part, see who sells it cheapest.
 *
 * Until 2026-10 this page was the PC builder. Most visitors want one part at
 * the best price, not a whole machine, so the builder moved to /build and is
 * one click away in the header.
 */
export const revalidate = 172800

export const metadata: Metadata = {
  title: {
    absolute: `${SITE_NAME} — compare PC part prices in Sri Lanka`,
  },
  // Under ~155 characters, where Google cuts a result's description. The shop
  // names used to be listed here and ran it to 201, so the benefit got cut.
  description: `Find the cheapest place to buy PC parts in Sri Lanka. Prices from ${TRACKED_SHOPS.length} local shops, compared side by side and checked every night.`,
  alternates: { canonical: canonical('/') },
  openGraph: {
    title: `${SITE_NAME} — compare PC part prices in Sri Lanka`,
    description:
      'Every Sri Lankan shop’s price for the same PC part, side by side and checked nightly.',
    url: canonical('/'),
    type: 'website',
  },
}

/** Example searches, each one checked to return in-stock parts. */
const EXAMPLES: { q: string; slot: Category }[] = [
  { q: 'RTX 5070', slot: 'gpu' },
  { q: 'Ryzen 7', slot: 'cpu' },
  { q: 'DDR5 32GB', slot: 'ram' },
]

export default async function Home() {
  const [directory, priceIndex] = await Promise.all([loadDirectory(), loadPriceIndex()])
  const totalParts = CATEGORIES.reduce((n, slot) => n + directory[slot].length, 0)
  const deals = toDealItems(findDeals(directory, priceIndex))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': canonical('/#organization'),
        name: SITE_NAME,
        url: canonical('/'),
        logo: canonical('/apple-icon.png'),
        description: `Compares PC part prices from ${TRACKED_SHOPS.length} Sri Lankan shops. It does not sell anything itself.`,
      },
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: canonical('/'),
        inLanguage: 'en-LK',
        description: 'PC part prices from Sri Lankan shops, compared side by side.',
        publisher: { '@id': canonical('/#organization') },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${canonical('/search')}?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <SiteHeader search={false} />

      <main className="mx-auto max-w-[1240px] px-5 pb-6 sm:px-8">
        <section aria-labelledby="hero" className="flex flex-col items-start gap-5 pb-12 pt-12 sm:pt-[72px]">
          <p className="eyebrow m-0 text-[11px]">
            {TRACKED_SHOPS.length} Sri Lankan shops · prices checked every night
          </p>
          <h1 id="hero" className="display m-0 max-w-[16ch]">
            Find the cheapest place to buy any PC&nbsp;part.
          </h1>
          <p className="m-0 max-w-[54ch] text-[17px] leading-[1.5] text-ink-2 [text-wrap:pretty]">
            Pick a category, pick the part, and see every shop’s price side by side. In stock, in
            rupees, updated nightly.
          </p>
          <div className="mt-2 w-full">
            <SearchBox
              large
              placeholder={`Search ${totalParts.toLocaleString('en-LK')} parts, e.g. RTX 5070`}
              after={
                <Link
                  href="/build"
                  className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-[rgb(90_130_230/40%)] bg-[rgb(120_160_255/16%)] px-5 text-[15px] font-semibold text-[var(--accent-strong)] transition hover:border-[var(--accent)] hover:bg-[rgb(120_160_255/24%)] sm:flex-none"
                >
                  <CaseIcon className="h-5 w-5" />
                  Build a PC
                </Link>
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <span>Try:</span>
            {EXAMPLES.map(({ q, slot }) => {
              const { Icon, tint, ink, strong } = CATEGORY_STYLE[slot]
              return (
                <Link
                  key={q}
                  href={`/search?q=${encodeURIComponent(q)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-3 font-medium transition hover:-translate-y-px"
                  style={{
                    background: tint,
                    borderColor: `color-mix(in oklch, ${ink} 28%, transparent)`,
                    color: strong,
                  }}
                >
                  <Icon className="h-4 w-4" style={{ color: ink }} />
                  {q}
                </Link>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="categories" className="flex flex-col gap-4 pb-14">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="categories" className="text-[22px] font-semibold tracking-[-0.02em]">
              Shop by category
            </h2>
            <span className="mono text-[12px] text-ink-3">
              Counts are parts in stock somewhere today
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
            {CATEGORIES.map((slot) => {
              const { Icon, tint, ink } = CATEGORY_STYLE[slot]
              const inStock = directory[slot].filter((p) => p.bestLkr !== null)
              const from = inStock.length ? Math.min(...inStock.map((p) => p.bestLkr!)) : null
              return (
                <li key={slot}>
                  <Link
                    href={`/${slot}`}
                    className="glass flex h-full min-h-[172px] flex-col gap-3.5 p-[18px] transition hover:-translate-y-0.5"
                  >
                    <span
                      className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)]"
                      style={{ background: tint, color: ink }}
                    >
                      <Icon className="h-[26px] w-[26px]" />
                    </span>
                    <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
                      {sentenceCase(CATEGORY_COPY[slot].plural)}
                    </span>
                    <span className="mono mt-auto flex flex-col gap-0.5 text-[12px] text-ink-3">
                      <span>{inStock.length} in stock</span>
                      {from !== null && (
                        <span className="font-medium text-ink">from {rupees(from)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        {deals.length > 0 && (
          <section aria-labelledby="deals" className="flex flex-col gap-4 pb-14">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="deals" className="text-[22px] font-semibold tracking-[-0.02em]">
                  Below their usual price
                </h2>
                <p className="m-0 text-[15px] text-ink-2">Cheaper today than over the last 30 days.</p>
              </div>
              <Link href="/deals" className="whitespace-nowrap text-[14px] font-semibold text-accent hover:underline">
                See all {deals.length} {deals.length === 1 ? 'deal' : 'deals'} →
              </Link>
            </div>
            {/* Sideways scroll on phones, a row of four from small screens up. */}
            <div className="-mx-5 flex snap-x gap-3.5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
              {deals.slice(0, 4).map((d) => (
                <DealCard key={d.partId} deal={d} />
              ))}
            </div>
          </section>
        )}

        <ShopProfiles stats={shopStats(Object.values(directory).flat(), TRACKED_SHOPS)} />

        <section
          aria-labelledby="builder"
          className="mb-14 flex flex-wrap items-center justify-between gap-x-8 gap-y-5 rounded-[var(--radius)] border border-[rgb(90_130_230/22%)] bg-[rgb(120_160_255/9%)] px-7 py-6"
        >
          <div className="flex flex-1 basis-[420px] items-start gap-4">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[var(--radius-sm)] bg-white text-accent shadow-[var(--glass-shadow)]">
              <CaseIcon className="h-6 w-6" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 id="builder" className="text-[17px] font-semibold tracking-[-0.01em]">
                Building a whole PC?
              </h2>
              <p className="m-0 max-w-[62ch] text-[14.5px] leading-[1.5] text-ink-2">
                Pick parts one at a time in the PC builder. It checks they fit together (socket,
                memory, power, case size) and totals the cheapest shop for each part.
              </p>
            </div>
          </div>
          <Link
            href="/build"
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-[18px] text-[14px] font-semibold text-white transition hover:bg-[var(--accent-strong)]"
          >
            Open the PC builder
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
