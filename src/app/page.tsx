import type { Metadata } from 'next'
import Link from 'next/link'

import { CATEGORY_STYLE, CaseIcon } from './components/PartIcons'
import { SearchBox } from './components/SearchBox'
import { SiteFooter, SiteHeader } from './components/SiteChrome'

import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { CATEGORY_COPY, SITE_NAME, TRACKED_SHOPS, canonical, rupees, sentenceCase } from '@/lib/site'
import { loadDirectory, type SeoPart } from '@/queries/seo'

/**
 * Home: pick a category, pick the part, see who sells it cheapest.
 *
 * Until 2026-10 this page was the PC builder. Most visitors want one part at
 * the best price, not a whole machine, so the builder moved to /build and is
 * one click away in the header.
 */
export const revalidate = 1800

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
const EXAMPLES: { q: string; slot: BuildSlot }[] = [
  { q: 'RTX 5070', slot: 'gpu' },
  { q: 'Ryzen 7', slot: 'cpu' },
  { q: 'DDR5 32GB', slot: 'ram' },
]

type Gap = { part: SeoPart; slot: BuildSlot; best: number; worst: number; at: string; shops: number }

/** The parts whose cheapest and dearest in-stock shop are furthest apart. */
function biggestGaps(directory: Record<BuildSlot, SeoPart[]>, count: number): Gap[] {
  const gaps: Gap[] = []
  for (const slot of BUILD_SLOTS) {
    for (const part of directory[slot]) {
      const buyable = part.offers.filter((o) => o.inStock && !o.stale)
      if (buyable.length < 2) continue
      const prices = buyable.map((o) => o.priceLkr)
      const best = Math.min(...prices)
      gaps.push({
        part,
        slot,
        best,
        worst: Math.max(...prices),
        at: buyable.find((o) => o.priceLkr === best)!.shop,
        shops: buyable.length,
      })
    }
  }
  return gaps.sort((a, b) => b.worst - b.best - (a.worst - a.best)).slice(0, count)
}

export default async function Home() {
  const directory = await loadDirectory()
  const totalParts = BUILD_SLOTS.reduce((n, slot) => n + directory[slot].length, 0)
  const gaps = biggestGaps(directory, 4)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: canonical('/'),
    inLanguage: 'en-LK',
    description: 'PC part prices from Sri Lankan shops, compared side by side.',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${canonical('/search')}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
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
            {BUILD_SLOTS.map((slot) => {
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

        {gaps.length > 0 && (
          <section aria-labelledby="gaps" className="flex flex-col gap-4 pb-14">
            <div className="flex flex-col gap-1.5">
              <h2 id="gaps" className="text-[22px] font-semibold tracking-[-0.02em]">
                Same part. Very different price.
              </h2>
              <p className="m-0 text-[15px] text-ink-2">
                Cheapest against dearest, among shops that have it in stock today. Graphics cards
                are compared by chip, so the brand of card can differ between shops.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
              {gaps.map((g) => {
                const { Icon, tint, ink } = CATEGORY_STYLE[g.slot]
                return (
                  <li key={g.part.partId}>
                    <Link
                      href={`/${g.slot}/${g.part.partId}`}
                      className="glass flex h-full flex-col gap-3.5 p-5 transition hover:-translate-y-0.5"
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.01em]">
                          <span
                            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px]"
                            style={{ background: tint, color: ink }}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          {g.part.model}
                        </span>
                        <span className="mono rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent-strong)]">
                          {rupees(g.worst - g.best)} apart
                        </span>
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="eyebrow text-[11px]">Cheapest</span>
                        <span className="mono text-[22px] font-medium tracking-[-0.02em] text-accent">
                          {rupees(g.best)}
                        </span>
                        <span className="text-[13px] text-ink-2">at {g.at}</span>
                      </span>
                      <span className="mt-auto border-t border-[var(--hairline)] flex items-center justify-between gap-2 pt-3 text-[12.5px] text-ink-3">
                        <span className="mono">Dearest {rupees(g.worst)}</span>
                        <span>{g.shops} shops in stock</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

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

        <section aria-labelledby="shops" className="flex flex-col gap-3.5 pb-6">
          <h2 id="shops" className="eyebrow text-[11px]">
            Shops we check every night
          </h2>
          <ul className="mono flex flex-wrap gap-2 text-[13px] text-ink-2">
            {TRACKED_SHOPS.map((shop) => (
              <li key={shop} className="rounded-full border border-[var(--glass-border)] bg-white/90 px-3.5 py-2">
                {shop}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
