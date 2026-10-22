import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CategoryList, type ListRow } from '@/app/components/CategoryList'
import { CATEGORY_STYLE } from '@/app/components/PartIcons'
import { SiteFooter, SiteHeader } from '@/app/components/SiteChrome'
import { CATEGORIES, isCategory, type Category, CATEGORY_COPY, SITE_NAME, TRACKED_SHOPS, canonical, rupees, sentenceCase } from '@/lib/site'
import { peripheralLabel, specSummary } from '@/lib/specs'
import { loadDirectory, type SeoPart } from '@/queries/seo'

/**
 * One browse page per category — /gpu, /cpu, /psu and so on.
 *
 * These exist to be found. "graphics card price in sri lanka" is a query a
 * person actually types and that a page can plausibly answer; the builder
 * cannot rank for it, because its content is assembled in the browser and
 * there is nothing in the HTML about graphics cards until someone clicks.
 */

export const revalidate = 1800
export const dynamicParams = false

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }))
}

function asSlot(value: string): Category | null {
  return isCategory(value) ? value : null
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
      )}. Prices from local shops, updated daily.`
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

type Facet = {
  label: string
  value: (p: SeoPart) => string | null
  /** Display order when alphabetical or numeric order would be wrong. */
  order?: string[]
}

const STORAGE_TYPE = { 'm2-nvme': 'M.2 NVMe', 'm2-sata': 'M.2 SATA', sata: 'SATA' } as const

/**
 * The specs worth filtering on, per category, in sidebar order.
 *
 * Only specs the data actually covers: a filter over a mostly-empty column
 * hides most of the list. Processors have no memory-type filter on purpose:
 * LGA1700 chips take either generation, so their `ramType` is null, and a DDR5
 * filter would wrongly hide them.
 */
const FACETS: Record<Category, Facet[]> = {
  gpu: [{ label: 'Video memory', value: (p) => (p.vramGb ? `${p.vramGb} GB` : null) }],
  cpu: [{ label: 'Socket', value: (p) => p.socket ?? null }],
  motherboard: [
    { label: 'Socket', value: (p) => p.socket ?? null },
    { label: 'Memory type', value: (p) => p.ramType ?? null },
    { label: 'Form factor', value: (p) => p.formFactor ?? null },
  ],
  ram: [
    { label: 'Memory type', value: (p) => p.ramType ?? null },
    { label: 'Capacity', value: (p) => (p.capacityGb ? `${p.capacityGb} GB` : null) },
    { label: 'Speed', value: (p) => (p.speedMhz ? `${p.speedMhz} MHz` : null) },
  ],
  storage: [
    { label: 'Type', value: (p) => (p.storageInterface ? STORAGE_TYPE[p.storageInterface] : null) },
    {
      label: 'Capacity',
      value: (p) =>
        p.capacityGb
          ? p.capacityGb >= 1000
            ? `${p.capacityGb / 1000} TB`
            : `${p.capacityGb} GB`
          : null,
    },
  ],
  psu: [
    { label: 'Wattage', value: (p) => (p.ratedWatts ? `${p.ratedWatts} W` : null) },
    {
      label: 'Efficiency',
      value: (p) => p.efficiencyRating ?? null,
      order: ['80+', '80+ Bronze', '80+ Silver', '80+ Gold', '80+ Platinum', '80+ Titanium'],
    },
  ],
  case: [{ label: 'Form factor', value: (p) => p.formFactor ?? null }],
  peripherals: [
    {
      label: 'Type',
      value: (p) => peripheralLabel(p.peripheralType),
      order: ['Keyboard', 'Mouse', 'Gamepad'],
    },
    {
      label: 'Connection',
      value: (p) => (p.wireless == null ? null : p.wireless ? 'Wireless' : 'Wired'),
    },
  ],
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const slot = asSlot((await params).category)
  if (!slot) notFound()

  const copy = CATEGORY_COPY[slot]
  const { Icon, tint, ink } = CATEGORY_STYLE[slot]
  const items = (await loadDirectory())[slot]
  const inStock = items.filter((p) => p.inStockShops > 0)
  const listed = new Set(items.flatMap((p) => p.offers.map((o) => o.shop)))
  const shops = TRACKED_SHOPS.filter((s) => listed.has(s))

  const rows: ListRow[] = items.map((p) => ({
    partId: p.partId,
    model: p.model,
    brand: p.brand,
    specs: specSummary(p),
    facets: FACETS[slot].map((f) => f.value(p)),
    offers: p.offers.map((o) => ({
      shop: o.shop,
      priceLkr: o.priceLkr,
      buyable: o.inStock && !o.stale,
    })),
  }))

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

      <main className="mx-auto max-w-[1240px] px-5 pb-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="pt-7 text-[13px] text-ink-3">
          <Link href="/" className="text-ink-2 underline-offset-2 hover:underline">
            Home
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span aria-current="page">{sentenceCase(copy.plural)}</span>
        </nav>

        <div className="flex flex-col gap-3 pb-6 pt-3.5">
          <div className="flex items-center gap-4">
            <span
              className="grid h-[52px] w-[52px] flex-none place-items-center rounded-[14px]"
              style={{ background: tint, color: ink }}
            >
              <Icon className="h-[30px] w-[30px]" />
            </span>
            <h1 className="m-0 text-[clamp(30px,3.6vw,42px)] font-semibold leading-[1.05] tracking-[-0.035em]">
              {copy.heading} prices in Sri&nbsp;Lanka
            </h1>
          </div>
          <p className="m-0 max-w-[68ch] text-[15.5px] leading-[1.55] text-ink-2 [text-wrap:pretty]">
            {inStock.length} in stock across {shops.length} shops. {copy.blurb}
          </p>
        </div>

        <nav
          aria-label="Categories"
          className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-6 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {CATEGORIES.map((s) => {
            const style = CATEGORY_STYLE[s]
            const current = s === slot
            return (
              <Link
                key={s}
                href={`/${s}`}
                aria-current={current ? 'page' : undefined}
                className={`inline-flex flex-none items-center gap-2 rounded-full border py-2 pl-3 pr-4 text-[13.5px] transition ${
                  current
                    ? 'font-semibold text-white'
                    : 'border-[var(--glass-border)] bg-white/90 font-medium text-ink-2 hover:text-ink'
                }`}
                style={current ? { background: style.strong, borderColor: style.strong } : undefined}
              >
                <style.Icon
                  className="h-[18px] w-[18px]"
                  style={{ color: current ? '#ffffff' : style.ink }}
                />
                {sentenceCase(CATEGORY_COPY[s].plural)}
              </Link>
            )
          })}
        </nav>

        {items.length === 0 ? (
          <p className="glass px-5 py-8 text-[13.5px] text-ink-3">
            Nothing listed in this category yet.
          </p>
        ) : (
          <CategoryList
            slot={slot}
            rows={rows}
            facets={FACETS[slot].map(({ label, order }) => ({ label, order }))}
            shops={shops}
            noun={copy.plural}
          />
        )}

        {slot !== 'peripherals' && (
          <p className="mt-4 px-1 text-[13px] leading-relaxed text-ink-3">
            Picking a {copy.singular} for a whole machine?{' '}
            <Link href="/build" className="text-accent underline-offset-2 hover:underline">
              Use the PC builder
            </Link>{' '}
            and it will only show you parts that fit what you have already chosen.
          </p>
        )}
      </main>

      <SiteFooter />
    </>
  )
}

