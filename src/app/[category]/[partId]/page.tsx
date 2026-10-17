import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AddToBuild } from '@/app/components/AddToBuild'
import { CATEGORY_STYLE } from '@/app/components/PartIcons'
import { SiteFooter, SiteHeader } from '@/app/components/SiteChrome'
import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { CATEGORY_COPY, SITE_NAME, canonical, rupees, sentenceCase } from '@/lib/site'
import { fitNote, specLines, specPhrase } from '@/lib/specs'
import { loadDirectory, loadPriceIndex, type PricePoint, type SeoPart } from '@/queries/seo'

/**
 * A page per part — /gpu/rtx-5070-12gb.
 *
 * This is the whole point of the exercise. Someone searching "rtx 5070 price
 * sri lanka" is looking for one specific answer — which shop is cheapest — and
 * a page that answers only that question is the only thing that can rank for
 * it. So the cheapest in-stock shop leads, with a way straight to it.
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

function ExternalIcon({ className }: { className?: string }) {
  return (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
  )
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
  const { Icon, tint, ink, strong } = CATEGORY_STYLE[slot]
  const name = displayName(part)
  const path = `/${slot}/${part.partId}`
  const specs = specLines(part)
  const note = fitNote(part)

  const buyable = part.offers.filter((o) => o.inStock && !o.stale)
  const quoted = buyable.length > 0 ? buyable : part.offers
  const quotedPrices = quoted.map((o) => o.priceLkr)
  // Offers are sorted buyable-first then cheapest, so the first buyable one is
  // the cheapest you can actually pay.
  const best = buyable[0] ?? null
  const dearest = buyable.length > 1 ? Math.max(...buyable.map((o) => o.priceLkr)) : null

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

      <main className="mx-auto max-w-[1240px] px-5 pb-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="pt-7 text-[13px] text-ink-3">
          <Link href="/" className="text-ink-2 underline-offset-2 hover:underline">
            Home
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <Link href={`/${slot}`} className="text-ink-2 underline-offset-2 hover:underline">
            {sentenceCase(copy.plural)}
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span aria-current="page">{part.model}</span>
        </nav>

        <div className="flex flex-col gap-3 pb-7 pt-3.5">
          <div className="flex items-center gap-4">
            <span
              className="grid h-14 w-14 flex-none place-items-center rounded-[14px]"
              style={{ background: tint, color: ink }}
            >
              <Icon className="h-8 w-8" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="eyebrow text-[11.5px]" style={{ color: strong }}>
                {copy.heading}
              </span>
              <h1 className="m-0 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.08] tracking-[-0.035em] [text-wrap:balance]">
                {name} <span className="font-normal text-ink-3">price in Sri&nbsp;Lanka</span>
              </h1>
            </div>
          </div>
          <p className="m-0 max-w-[68ch] text-[15.5px] leading-[1.55] text-ink-2 [text-wrap:pretty]">
            {best ? (
              <>
                Cheapest in stock at <strong className="font-semibold text-ink">{best.shop}</strong>,{' '}
                {part.inStockShops} of the {part.offers.length} shops carrying it have it now.
              </>
            ) : (
              <>
                No shop we track has the {name} in stock right now. It was last listed at{' '}
                <strong className="font-semibold text-ink">{rupees(part.lowLkr)}</strong>.
              </>
            )}{' '}
            {note}
          </p>
          {specs.length > 0 && (
            <ul className="mono mt-1 flex flex-wrap gap-2 text-[12px] text-ink-2">
              {specs.slice(0, 3).map((s) => (
                <li key={s.label} className="rounded-full border border-[var(--glass-border)] bg-white/90 px-3 py-1.5">
                  {s.value} <span className="text-ink-3">{s.label.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
            <section aria-labelledby="prices" className="glass overflow-hidden">
              <div className="hairline-b flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
                <h2 id="prices" className="text-[16px] font-semibold tracking-[-0.015em]">
                  Price at each shop
                </h2>
                <span className="text-[12.5px] text-ink-3">
                  Cheapest first · checked {part.updatedOn}
                </span>
              </div>
              <div className="price-table-wrap">
                <table className="price-table text-[14px]">
                  <thead>
                    <tr className="eyebrow text-left text-[11px]">
                      <th scope="col">Shop</th>
                      <th scope="col" className="text-right">Price</th>
                      <th scope="col" className="text-right">vs cheapest</th>
                      <th scope="col">Stock</th>
                      <th scope="col">
                        <span className="sr-only">Link</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {part.offers.map((o) => {
                      const live = o.inStock && !o.stale
                      const isBest = best !== null && o === best
                      return (
                        <tr key={o.shop} className={isBest ? 'bg-[rgb(120_160_255/7%)]' : undefined}>
                          <th scope="row" className={`mono text-left text-[13.5px] font-medium ${live ? '' : 'text-ink-3'}`}>
                            <span className="inline-flex flex-wrap items-center gap-2">
                              {o.shop}
                              {isBest && (
                                <span className="rounded-full bg-[var(--accent)] px-2 py-[3px] font-sans text-[11px] font-semibold text-white">
                                  Cheapest
                                </span>
                              )}
                            </span>
                          </th>
                          <td data-label="Price" className={`mono text-right text-[15px] font-medium ${live ? '' : 'text-ink-3'}`}>
                            {rupees(o.priceLkr)}
                          </td>
                          <td data-label="vs cheapest" className="mono text-right text-[13px] text-ink-2">
                            {!live || !best
                              ? '—'
                              : isBest
                                ? 'Cheapest'
                                : o.priceLkr === best.priceLkr
                                  ? 'Same'
                                  : `+ ${rupees(o.priceLkr - best.priceLkr)}`}
                          </td>
                          <td data-label="Stock" className="text-[13px] text-ink-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden
                                className={`h-[7px] w-[7px] rounded-full ${o.inStock && !o.stale ? 'bg-ok' : 'bg-[oklch(0.78_0.02_260)]'}`}
                              />
                              {o.stale ? `Last seen ${o.seenOn}` : o.inStock ? 'In stock' : 'Out of stock'}
                            </span>
                          </td>
                          <td className="text-right">
                            <a
                              href={o.url}
                              target="_blank"
                              rel="noopener nofollow"
                              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[rgb(30_50_100/12%)] bg-white px-3 text-[13px] font-semibold text-[var(--accent-strong)] transition hover:border-[var(--accent-soft-border)]"
                            >
                              Visit shop
                              <ExternalIcon />
                              <span className="sr-only">(opens {o.shop} in a new tab)</span>
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {part.offers.some((o) => !o.inStock || o.stale) && (
                <p className="m-0 bg-[var(--sunken)] px-5 py-3 text-[12.5px] text-ink-3">
                  An out-of-stock or unconfirmed price is shown for reference and never counts as
                  the cheapest.
                </p>
              )}
            </section>

            {series.length > 1 && seriesLow !== null && seriesHigh !== null && (
              <section aria-labelledby="history" className="glass flex flex-col gap-3.5 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="history" className="text-[16px] font-semibold tracking-[-0.015em]">
                    Price history
                  </h2>
                  <span className="mono text-[12.5px] text-ink-2">
                    {seriesLow === seriesHigh
                      ? rupees(seriesLow)
                      : `${rupees(seriesLow)} – ${rupees(seriesHigh)}`}
                  </span>
                </div>
                {/*
                  The history table records a price per shop per day with no stock
                  flag, so this is the lowest price *listed* — not necessarily one
                  that was in stock. Saying "cheapest" here would contradict the
                  card beside it, which counts only what you can actually buy.
                */}
                <PriceChart points={series} />
                <p className="m-0 text-[12.5px] text-ink-3">
                  Lowest price listed each day over the last {series.length} days, including
                  listings that were out of stock.
                </p>
              </section>
            )}

            {related.length > 0 && (
              <section aria-labelledby="related" className="flex flex-col gap-3">
                <h2 id="related" className="text-[16px] font-semibold tracking-[-0.015em]">
                  Similarly priced {copy.plural}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                  {related.map((r) => (
                    <li key={r.partId}>
                      <Link
                        href={`/${slot}/${r.partId}`}
                        className="glass flex h-full flex-col gap-1.5 rounded-2xl p-4 transition hover:-translate-y-0.5"
                      >
                        <span className="text-[14.5px] font-semibold tracking-[-0.01em]">{r.model}</span>
                        <span className={`mono text-[15px] font-medium ${r.bestLkr !== null ? 'text-accent' : 'text-ink-3'}`}>
                          {rupees(r.bestLkr ?? r.lowLkr)}
                        </span>
                        <span className="text-[12.5px] text-ink-3">
                          {r.bestLkr !== null ? `at ${r.offers[0].shop}` : 'out of stock'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside aria-label="Where to buy" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[380px]">
            <section className="flex flex-col gap-3.5 rounded-[var(--radius)] border border-[var(--accent-soft-border)] bg-white/95 p-[22px] shadow-[0_14px_34px_-18px_rgb(35_55_110/35%)]">
              {best ? (
                <>
                  <h2 className="eyebrow text-[11px]">Cheapest in stock</h2>
                  <p className="m-0 flex flex-col gap-1">
                    <span className="mono text-[36px] font-medium leading-none tracking-[-0.03em] text-accent">
                      {rupees(best.priceLkr)}
                    </span>
                    <span className="text-[14px] text-ink-2">
                      at <span className="mono text-ink">{best.shop}</span>
                    </span>
                  </p>
                  <a
                    href={best.url}
                    target="_blank"
                    rel="noopener nofollow"
                    className="flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] text-[15px] font-semibold text-white transition hover:bg-[var(--accent-strong)]"
                  >
                    Go to {best.shop}
                    <ExternalIcon className="h-4 w-4" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  <p className="m-0 border-t border-[var(--hairline)] pt-3 text-[13.5px] leading-[1.45] text-ink-2">
                    {dearest !== null && dearest > best.priceLkr ? (
                      <>
                        <strong className="font-semibold text-ink">
                          {rupees(dearest - best.priceLkr)} less
                        </strong>{' '}
                        than the dearest shop that has it in stock.
                      </>
                    ) : buyable.length > 1 ? (
                      <>Same price at all {buyable.length} shops that have it in stock.</>
                    ) : (
                      <>Only {best.shop} has it in stock right now.</>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="eyebrow text-[11px]">Out of stock everywhere</h2>
                  <p className="m-0 flex flex-col gap-1">
                    <span className="mono text-[30px] font-medium leading-none tracking-[-0.03em] text-ink-3">
                      {rupees(part.lowLkr)}
                    </span>
                    <span className="text-[14px] text-ink-2">last listed price</span>
                  </p>
                  <p className="m-0 text-[13.5px] leading-[1.45] text-ink-2">
                    None of the {part.offers.length} shops carrying it has it in stock. Check back
                    after tonight’s price check.
                  </p>
                </>
              )}
            </section>

            <section
              aria-labelledby="build"
              className="flex flex-col gap-2.5 rounded-[var(--radius)] border border-[var(--glass-border)] bg-[var(--sunken)] px-5 py-[18px]"
            >
              <h2 id="build" className="text-[14.5px] font-semibold">
                Building a PC?
              </h2>
              <p className="m-0 text-[13.5px] leading-[1.5] text-ink-2">
                Add this {copy.singular} to the PC builder and it checks everything else you pick
                fits with it.
              </p>
              <AddToBuild slot={slot} partId={part.partId} shop={best?.shop ?? null}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add to my build
              </AddToBuild>
            </section>

            {specs.length > 0 && (
              <section aria-labelledby="specs" className="glass overflow-hidden">
                <h2 id="specs" className="hairline-b px-5 py-3.5 text-[14.5px] font-semibold">
                  Specifications
                </h2>
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

            <p className="m-0 px-1 text-[12.5px] leading-[1.5] text-ink-3">
              Prices and stock change between our nightly checks. Confirm with the shop before you
              buy.
            </p>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

/**
 * The lowest listed price per day. Rendered server-side as plain SVG so it is in
 * the HTML and costs no JavaScript; it lengthens on its own as the nightly runs
 * accumulate.
 */
function PriceChart({ points }: { points: PricePoint[] }) {
  const w = 600
  const h = 140
  const pad = 12
  const values = points.map((p) => p.lowestLkr)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = w / (points.length - 1)
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2)
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')
  const first = points[0]
  const last = points.at(-1)!

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block h-[140px] w-full"
        role="img"
        aria-label={`Lowest listed price from ${first.day} to ${last.day}: ${rupees(first.lowestLkr)} to ${rupees(last.lowestLkr)}, ranging ${rupees(min)} to ${rupees(max)}.`}
      >
        <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--accent-soft)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mono flex justify-between gap-2 text-[12px] text-ink-3">
        <span>
          {first.day.slice(5)} · {rupees(first.lowestLkr)}
        </span>
        <span className="font-medium text-ink">
          {last.day.slice(5)} · {rupees(last.lowestLkr)}
        </span>
      </figcaption>
    </figure>
  )
}
