import type { Metadata } from 'next'
import Link from 'next/link'

import { DealsList } from '../components/Deals'
import { SiteFooter, SiteHeader } from '../components/SiteChrome'
import { BUILD_SLOTS } from '@/compat/build'
import { findDeals, toDealItems } from '@/lib/deals'
import { CATEGORY_COPY, SITE_NAME, canonical, sentenceCase } from '@/lib/site'
import { loadDirectory, loadPriceIndex } from '@/queries/seo'

/** Parts below their usual price. Rebuilt with the catalogue, at most every 30 minutes. */

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'PC part deals in Sri Lanka',
  description:
    'PC parts selling below their usual price in Sri Lanka today, from local shops. Checked every night against each part’s last 30 days.',
  alternates: { canonical: canonical('/deals') },
  openGraph: {
    title: `PC part deals in Sri Lanka | ${SITE_NAME}`,
    url: canonical('/deals'),
    type: 'website',
  },
}

export default async function DealsPage() {
  const [directory, priceIndex] = await Promise.all([loadDirectory(), loadPriceIndex()])
  const deals = toDealItems(findDeals(directory, priceIndex))
  const labels = Object.fromEntries(BUILD_SLOTS.map((s) => [s, sentenceCase(CATEGORY_COPY[s].plural)]))

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1000px] px-5 pb-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="pt-7 text-[13px] text-ink-3">
          <Link href="/" className="text-ink-2 underline-offset-2 hover:underline">
            Home
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span aria-current="page">Deals</span>
        </nav>

        <div className="flex flex-col gap-2.5 pb-6 pt-3">
          <h1 className="m-0 text-[clamp(30px,3.6vw,42px)] font-semibold tracking-[-0.035em]">
            PC part deals in Sri Lanka
          </h1>
          <p className="m-0 max-w-[64ch] text-[15.5px] leading-relaxed text-ink-2">
            Parts selling below their usual price right now. A part makes this list when its
            cheapest in-stock price is at least 5% under its typical price over the last 30 days.
            Checked every night.
          </p>
        </div>

        {deals.length > 0 ? (
          <DealsList deals={deals} labels={labels} />
        ) : (
          <p className="m-0 rounded-[20px] border border-dashed border-[rgb(30_50_100/20%)] bg-white/70 px-6 py-5 text-[14.5px] leading-relaxed text-ink-2">
            No part is more than 5% below its usual price today. Prices are checked every night, so
            look again tomorrow, or{' '}
            <Link href="/" className="text-accent underline underline-offset-2">
              compare prices by category
            </Link>
            .
          </p>
        )}
      </main>

      <SiteFooter />
    </>
  )
}
