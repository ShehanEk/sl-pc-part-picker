import type { Metadata } from 'next'

import { Configurator } from './components/Configurator'
import { SiteFooter, SiteHeader } from './components/SiteChrome'

import { BUILD_SLOTS } from '@/compat/build'
import { CATEGORY_COPY, SITE_NAME, TRACKED_SHOPS, canonical } from '@/lib/site'
import { loadCatalogue } from '@/queries/build'

export const revalidate = 1800

export const metadata: Metadata = {
  title: {
    absolute: `${SITE_NAME} — PC part prices and PC builder for Sri Lanka`,
  },
  description: `Build a PC from parts Sri Lankan shops actually stock. Compare prices at ${TRACKED_SHOPS.join(
    ', ',
  )}, mix parts from different shops, and we check they work together.`,
  alternates: { canonical: canonical('/') },
  openGraph: {
    title: `${SITE_NAME} — PC part prices and PC builder for Sri Lanka`,
    description:
      'Compare PC part prices across Sri Lankan shops and build a machine from parts that work together.',
    url: canonical('/'),
    type: 'website',
  },
}

export default async function Home() {
  const catalogue = await loadCatalogue()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: canonical('/'),
    inLanguage: 'en-LK',
    description:
      'PC part prices from Sri Lankan retailers, with a compatibility checker for building a whole machine.',
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <SiteHeader />

      <div className="mx-auto max-w-[1300px] px-5 pb-4 pt-10 sm:px-8 sm:pt-14">
        <h1 className="display m-0">Build a PC, priced in Sri&nbsp;Lanka.</h1>
        <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.5] text-ink-2 [text-wrap:pretty]">
          Pick one part at a time. We keep the build compatible and show which local shop has
          each one cheapest.
        </p>
      </div>

      <Configurator catalogue={catalogue} />

      {/*
        A crawlable summary of the catalogue. The configurator above holds the
        same parts, but assembles them in the browser, so this is the only part
        of the page a search engine can read and follow.
      */}
      <section
        aria-labelledby="browse"
        className="mx-auto max-w-[1300px] px-5 pb-2 sm:px-8"
      >
        <h2 id="browse" className="text-[15px] font-semibold tracking-[-0.015em]">
          Browse prices by category
        </h2>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {BUILD_SLOTS.map((slot) => {
            const items = catalogue[slot]
            const cheapest = items.length
              ? Math.min(...items.map((p) => p.priceLkr ?? Infinity))
              : null
            return (
              <a
                key={slot}
                href={`/${slot}`}
                className="glass block px-4 py-3.5 transition hover:-translate-y-px"
              >
                <span className="block text-[13.5px] font-medium capitalize">
                  {CATEGORY_COPY[slot].heading} prices in Sri Lanka
                </span>
                <span className="mono mt-1 block text-[11.5px] text-ink-3">
                  {items.length} in stock
                  {cheapest !== null && Number.isFinite(cheapest)
                    ? ` · from Rs ${Math.round(cheapest).toLocaleString('en-LK')}`
                    : ''}
                </span>
              </a>
            )
          })}
        </div>
      </section>

      <SiteFooter />
    </>
  )
}
