import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AddToBuild } from '@/app/components/AddToBuild'
import { SiteFooter, SiteHeader } from '@/app/components/SiteChrome'
import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { CATEGORY_COPY, SITE_NAME, canonical, rupees } from '@/lib/site'
import { fitNote, specLines, specPhrase } from '@/lib/specs'
import { loadDirectory, loadPriceIndex, type SeoPart } from '@/queries/seo'

/**
 * A page per part — /gpu/rtx-5070-12gb.
 *
 * This is the whole point of the exercise. Someone searching "rtx 5070 price
 * sri lanka" is looking for one specific answer, and a page that answers only
 * that question is the only thing that can rank for it. The configurator can't:
 * it holds every part in browser state, so its HTML says nothing about any of
 * them.
 *
 * Everything here is rendered on the server and prerendered at build, so the
 * price, the shops and the specs are all in the initial HTML.
 */

export const revalidate = 1800
export const dynamicParams = false

/**
 * Both segments are returned here rather than inheriting `category` from the
 * parent. Cascading only happens when the parent segment is a layout; the
 * category route is a page, which terminates, so its params do not reach this
 * one — and a leaf that returns only `partId` silently generates nothing.
 */
export async function generateStaticParams() {
  const directory = await loadDirectory()
  return BUILD_SLOTS.flatMap((category) =>
    directory[category].map((p) => ({ category, partId: p.partId })),
  )
}

function asSlot(value: string): BuildSlot | null {
  return (BUILD_SLOTS as string[]).includes(value) ? (value as BuildSlot) : null
}

function sentenceCase(s: string): string {
  return /^[A-Z]/.test(s) ? s : s[0].toUpperCase() + s.slice(1)
}

/** Shops list the brand in the model as often as not; don't say it twice. */
function displayName(part: SeoPart): string {
  const model = part.model.trim()
  return model.toLowerCase().includes(part.brand.toLowerCase())
    ? model
    : `${part.brand} ${model}`
}

async function find(categoryParam: string, partId: string) {
  const slot = asSlot(categoryParam)
  if (!slot) return null
  const part = (await loadDirectory())[slot].find((p) => p.partId === partId)
  return part ? { slot, part } : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; partId: string }>
}): Promise<Metadata> {
  const { category, partId } = await params
  const found = await find(category, partId)
  if (!found) return {}

  const { slot, part } = found
  const name = displayName(part)
  const path = `/${slot}/${part.partId}`
  const specs = specPhrase(part)

  const priceClause =
    part.bestLkr !== null
      ? `From ${rupees(part.bestLkr)} at ${part.inStockShops} ${
          part.inStockShops === 1 ? 'shop' : 'shops'
        }.`
      : `Last seen at ${rupees(part.lowLkr)}; currently out of stock everywhere we check.`

  return {
    title: `${name} price in Sri Lanka`,
    description: [
      `${name} price in Sri Lanka.`,
      priceClause,
      specs ? `${specs}.` : '',
      'Compare local shops and check it fits your build. Updated daily.',
    ]
      .filter(Boolean)
      .join(' '),
    alternates: { canonical: canonical(path) },
    openGraph: {
      title: `${name} price in Sri Lanka | ${SITE_NAME}`,
      description: priceClause,
      url: canonical(path),
      type: 'website',
    },
  }
}

export default async function PartPage({
  params,
}: {
  params: Promise<{ category: string; partId: string }>
}) {
  const { category, partId } = await params
  const found = await find(category, partId)
  if (!found) notFound()

  const { slot, part } = found
  const copy = CATEGORY_COPY[slot]
  const name = displayName(part)
  const path = `/${slot}/${part.partId}`
  const specs = specLines(part)
  const note = fitNote(part)

  const buyable = part.offers.filter((o) => o.inStock && !o.stale)
  const quoted = buyable.length > 0 ? buyable : part.offers
  const quotedPrices = quoted.map((o) => o.priceLkr)

  const [directory, priceIndex] = await Promise.all([loadDirectory(), loadPriceIndex()])
  const series = priceIndex[part.partId] ?? []
  const seriesLow = series.length ? Math.min(...series.map((p) => p.lowestLkr)) : null
  const seriesHigh = series.length ? Math.max(...series.map((p) => p.lowestLkr)) : null

  // Neighbours by price, for people who landed here and want the alternative.
  const siblings = directory[slot].filter((p) => p.partId !== part.partId)
  const anchor = part.bestLkr ?? part.lowLkr
  const related = siblings
    .map((p) => ({ p, delta: Math.abs((p.bestLkr ?? p.lowLkr) - anchor) }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 6)
    .map((r) => r.p)

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
          { '@type': 'ListItem', position: 3, name, item: canonical(path) },
        ],
      },
      {
        '@type': 'Product',
        name,
        url: canonical(path),
        category: copy.singular,
        brand: { '@type': 'Brand', name: part.brand },
        description: [
          `${name} available in Sri Lanka.`,
          specs.map((s) => `${s.label}: ${s.value}`).join('. '),
        ]
          .filter(Boolean)
          .join(' '),
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'LKR',
          lowPrice: Math.min(...quotedPrices),
          highPrice: Math.max(...quotedPrices),
          offerCount: quoted.length,
          availability:
            part.inStockShops > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          offers: part.offers.map((o) => ({
            '@type': 'Offer',
            price: o.priceLkr,
            priceCurrency: 'LKR',
            url: o.url,
            availability: o.inStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            seller: { '@type': 'Organization', name: o.shop },
          })),
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

      <SiteHeader />

      <div className="mx-auto max-w-[1300px] px-5 pb-4 pt-10 sm:px-8 sm:pt-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-[12.5px] text-ink-3">
          <Link href="/" className="underline-offset-2 hover:underline">
            Home
          </Link>
          <span className="mx-2 text-ink-4">/</span>
          <Link href={`/${slot}`} className="underline-offset-2 hover:underline">
            {copy.plural}
          </Link>
          <span className="mx-2 text-ink-4">/</span>
          <span className="text-ink-2">{part.model}</span>
        </nav>

        <h1 className="display m-0">{name} price in Sri&nbsp;Lanka</h1>

        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.55] text-ink-2 [text-wrap:pretty]">
          {part.bestLkr !== null ? (
            <>
              The {name} starts at <strong>{rupees(part.bestLkr)}</strong> in Sri Lanka, in stock
              at {part.inStockShops} of the {part.offers.length} shops carrying it.
            </>
          ) : (
            <>
              No shop we track has the {name} in stock right now. It was last listed at{' '}
              <strong>{rupees(part.lowLkr)}</strong>.
            </>
          )}{' '}
          {note}
        </p>
      </div>

      <div className="mx-auto grid max-w-[1300px] items-start gap-5 px-5 pb-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_clamp(280px,28vw,360px)]">
        <main className="min-w-0">
          <section aria-labelledby="prices" className="glass overflow-hidden">
            <div className="hairline-b px-5 py-4">
              <h2 id="prices" className="text-[15px] font-semibold tracking-[-0.015em]">
                Where to buy it
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-3">
                {part.offers.length} {part.offers.length === 1 ? 'shop' : 'shops'}, cheapest
                first. Prices last checked {part.updatedOn}.
              </p>
            </div>

            {part.offers.map((o) => (
              <div
                key={o.shop}
                className="hairline-b flex items-center gap-4 px-5 py-3.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener nofollow"
                    className="text-[14.5px] underline-offset-2 hover:text-accent hover:underline"
                  >
                    {o.shop}
                  </a>
                  <span className="mt-1 block text-[11.5px] text-ink-3">
                    {o.inStock ? 'In stock' : 'Out of stock'}
                    {o.stale && ` · last seen ${o.seenOn}`}
                  </span>
                </span>
                <span
                  className={`mono flex-none whitespace-nowrap text-[15px] tracking-[-0.02em] ${
                    o.inStock && !o.stale ? '' : 'text-ink-4'
                  }`}
                >
                  {rupees(o.priceLkr)}
                </span>
              </div>
            ))}
          </section>

          {series.length > 1 && seriesLow !== null && seriesHigh !== null && (
            <section aria-labelledby="history" className="glass mt-5 px-5 py-4">
              <h2 id="history" className="text-[15px] font-semibold tracking-[-0.015em]">
                Price history
              </h2>
              {/*
                The history table records a price per shop per day with no stock
                flag, so this is the lowest price *listed* — not necessarily one
                that was in stock. Saying "cheapest" here would contradict the
                headline above, which counts only what you can actually buy.
              */}
              <p className="mt-1 text-[12.5px] text-ink-3">
                {seriesLow === seriesHigh ? (
                  <>
                    Lowest listed price has held at {rupees(seriesLow)} across the{' '}
                    {series.length} days we have checked so far.
                  </>
                ) : (
                  <>
                    Lowest listed price over the last {series.length} days:{' '}
                    {rupees(seriesLow)} – {rupees(seriesHigh)}. This includes listings that
                    were out of stock.
                  </>
                )}
              </p>
              <Sparkline points={series.map((p) => p.lowestLkr)} />
            </section>
          )}

          {related.length > 0 && (
            <section aria-labelledby="related" className="glass mt-5 overflow-hidden">
              <div className="hairline-b px-5 py-4">
                <h2 id="related" className="text-[15px] font-semibold tracking-[-0.015em]">
                  Similarly priced {copy.plural}
                </h2>
              </div>
              {related.map((r) => (
                <Link
                  key={r.partId}
                  href={`/${slot}/${r.partId}`}
                  className="hairline-b row-tap flex items-center gap-4 px-5 py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{r.model}</span>
                  <span className="mono flex-none whitespace-nowrap text-[13px] text-ink-2">
                    {rupees(r.bestLkr ?? r.lowLkr)}
                  </span>
                </Link>
              ))}
            </section>
          )}
        </main>

        <aside className="min-w-0">
          {specs.length > 0 && (
            <section aria-labelledby="specs" className="glass overflow-hidden">
              <div className="hairline-b px-5 py-4">
                <h2 id="specs" className="text-[15px] font-semibold tracking-[-0.015em]">
                  Specifications
                </h2>
              </div>
              <dl className="px-5 py-2">
                {specs.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-baseline justify-between gap-4 border-b border-[var(--hairline)] py-2.5 last:border-b-0"
                  >
                    <dt className="text-[12.5px] text-ink-3">{s.label}</dt>
                    <dd className="mono text-[12.5px]">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="glass mt-5 px-5 py-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
              Will it fit your build?
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              Add the {copy.singular} to a build and we will check sockets, memory type, power
              and case size against everything else you pick, using only parts these shops
              actually stock.
            </p>
            <AddToBuild
              slot={slot}
              partId={part.partId}
              shop={buyable[0]?.shop ?? null}
            >
              Add to my build
            </AddToBuild>
          </section>
        </aside>
      </div>

      <SiteFooter />
    </>
  )
}

/**
 * A minimal trend line. Rendered server-side as plain SVG so it is in the HTML
 * and costs no JavaScript; with a couple of days of history it is a short line,
 * and it lengthens on its own as the nightly runs accumulate.
 */
function Sparkline({ points }: { points: number[] }) {
  const w = 560
  const h = 60
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = points.length > 1 ? w / (points.length - 1) : w

  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-3 h-[60px] w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Price trend over ${points.length} days`}
    >
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
