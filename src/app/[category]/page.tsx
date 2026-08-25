import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteFooter, SiteHeader } from '@/app/components/SiteChrome'
import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { CATEGORY_COPY, SITE_NAME, canonical, rupees } from '@/lib/site'
import { specSummary } from '@/lib/specs'
import { loadDirectory } from '@/queries/seo'

/**
 * One browse page per category — /gpu, /cpu, /psu and so on.
 *
 * These exist to be found. "graphics card price in sri lanka" is a query a
 * person actually types and that a page can plausibly answer; the configurator
 * on / cannot rank for it, because its content is assembled in the browser and
 * there is nothing in the HTML about graphics cards until someone clicks.
 */

export const revalidate = 1800
export const dynamicParams = false

export function generateStaticParams() {
  return BUILD_SLOTS.map((category) => ({ category }))
}

function asSlot(value: string): BuildSlot | null {
  return (BUILD_SLOTS as string[]).includes(value) ? (value as BuildSlot) : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const slot = asSlot((await params).category)
  if (!slot) return {}

  const copy = CATEGORY_COPY[slot]
  const items = (await loadDirectory())[slot]
  const inStock = items.filter((p) => p.inStockShops > 0)
  const cheapest = inStock.length ? Math.min(...inStock.map((p) => p.bestLkr!)) : null

  const title = `${copy.heading} prices in Sri Lanka`
  const description = cheapest
    ? `Compare ${inStock.length} ${copy.plural} in stock in Sri Lanka, from ${rupees(
        cheapest,
      )}. Local shop prices updated daily, with a compatibility check for the rest of your build.`
    : `${copy.heading} prices from Sri Lankan shops, updated daily.`

  return {
    title,
    description,
    alternates: { canonical: canonical(`/${slot}`) },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonical(`/${slot}`),
      type: 'website',
    },
  }
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const slot = asSlot((await params).category)
  if (!slot) notFound()

  const copy = CATEGORY_COPY[slot]
  const items = (await loadDirectory())[slot]
  const inStock = items.filter((p) => p.inStockShops > 0)
  const cheapest = inStock.length ? Math.min(...inStock.map((p) => p.bestLkr!)) : null
  const dearest = inStock.length ? Math.max(...inStock.map((p) => p.bestLkr!)) : null
  const shops = new Set(items.flatMap((p) => p.offers.map((o) => o.shop))).size

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: canonical('/') },
          {
            '@type': 'ListItem',
            position: 2,
            name: sentenceCase(copy.plural),
            item: canonical(`/${slot}`),
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: `${sentenceCase(copy.plural)} available in Sri Lanka`,
        numberOfItems: items.length,
        itemListElement: items.slice(0, 100).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.model,
          url: canonical(`/${slot}/${p.partId}`),
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <SiteHeader />

      <div className="mx-auto max-w-[1300px] px-5 pb-4 pt-10 sm:px-8 sm:pt-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-[12.5px] text-ink-3">
          <Link href="/" className="underline-offset-2 hover:underline">
            Home
          </Link>
          <span className="mx-2 text-ink-4">/</span>
          <span className="text-ink-2">{sentenceCase(copy.plural)}</span>
        </nav>

        <h1 className="display m-0">{copy.heading} prices in Sri&nbsp;Lanka</h1>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.55] text-ink-2 [text-wrap:pretty]">
          {copy.blurb}
        </p>

        {cheapest !== null && dearest !== null && (
          <p className="mono mt-3 text-[12.5px] text-ink-3">
            {inStock.length} in stock across {shops} shops · {rupees(cheapest)} –{' '}
            {rupees(dearest)}
          </p>
        )}
      </div>

      <div className="mx-auto max-w-[1300px] px-5 pb-6 sm:px-8">
        <div className="glass overflow-hidden">
          {items.length === 0 ? (
            <p className="px-5 py-8 text-[13.5px] text-ink-3">
              Nothing listed in this category yet.
            </p>
          ) : (
            items.map((p) => {
              const specs = specSummary(p)
              return (
                <Link
                  key={p.partId}
                  href={`/${slot}/${p.partId}`}
                  className="hairline-b row-tap flex items-center gap-4 px-5 py-3.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="truncate text-[14.5px] tracking-[-0.015em]">
                        {p.model}
                      </span>
                      <span className="mono hidden flex-none rounded-full bg-[rgb(30_50_100/5%)] px-2 py-[3px] text-[10px] text-ink-2 sm:inline">
                        {p.brand}
                      </span>
                    </span>
                    {specs && (
                      <span className="mono mt-1 block truncate text-[11.5px] text-ink-3">
                        {specs}
                      </span>
                    )}
                  </span>

                  <span className="w-[130px] flex-none text-right sm:w-[190px]">
                    <span className="mono block whitespace-nowrap text-[15px] tracking-[-0.02em]">
                      {p.bestLkr !== null ? rupees(p.bestLkr) : rupees(p.lowLkr)}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {p.inStockShops > 0
                        ? `${p.inStockShops} ${p.inStockShops === 1 ? 'shop' : 'shops'}`
                        : 'out of stock'}
                    </span>
                  </span>
                </Link>
              )
            })
          )}
        </div>

        <p className="mt-4 px-1 text-[13px] leading-relaxed text-ink-3">
          Picking a {copy.singular} for a whole machine?{' '}
          <Link href="/" className="text-accent underline-offset-2 hover:underline">
            Build it in the configurator
          </Link>{' '}
          and we will only show you parts that fit what you have already chosen.
        </p>
      </div>

      <SiteFooter />
    </>
  )
}

function sentenceCase(s: string): string {
  // "RAM" and "SSDs and hard drives" are already cased deliberately.
  return /^[A-Z]/.test(s) ? s : s[0].toUpperCase() + s.slice(1)
}
