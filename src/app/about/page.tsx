import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteFooter, SiteHeader } from '../components/SiteChrome'
import { SITE_NAME, TRACKED_SHOPS, canonical } from '@/lib/site'

/** Keep "How prices are collected" true to the pipeline: schedule, stock and stale rules. */

export const metadata: Metadata = {
  title: 'About',
  description: `How ${SITE_NAME} collects PC part prices from Sri Lankan shops, and why the cheapest in-stock price always comes first.`,
  alternates: { canonical: canonical('/about') },
}

const h2 = 'm-0 text-[17px] font-semibold tracking-[-0.01em]'
const p = 'm-0 text-[15px] leading-relaxed text-ink-2'
const ul = 'm-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-ink-2'
const shops = `${TRACKED_SHOPS.slice(0, -1).join(', ')} and ${TRACKED_SHOPS.at(-1)}`

export default function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[760px] px-5 pb-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="pt-7 text-[13px] text-ink-3">
          <Link href="/" className="text-ink-2 underline-offset-2 hover:underline">
            Home
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span aria-current="page">About</span>
        </nav>

        <h1 className="m-0 pb-6 pt-3 text-[clamp(30px,3.6vw,40px)] font-semibold tracking-[-0.035em]">
          About {SITE_NAME}
        </h1>

        <div className="glass flex flex-col gap-5 px-6 py-6 sm:px-7">
          <p className={p}>
            {SITE_NAME} shows where each PC part is cheapest in Sri Lanka right now, and checks that
            the parts you pick for a build work together.
          </p>

          <h2 className={h2}>How prices are collected</h2>
          <ul className={ul}>
            <li>
              Every other night, our software reads the public product pages of{' '}
              {TRACKED_SHOPS.length} shops: {shops}.
            </li>
            <li>
              For each product it records the price and whether the shop says it is in stock, then
              matches the same part across shops.
            </li>
            <li>
              Only in-stock prices count as the cheapest. A price we haven&apos;t seen for 7 days is
              shown as unconfirmed and never counts.
            </li>
            <li>Every price is kept, so each part page shows its price history.</li>
          </ul>

          <h2 className={h2}>Independent</h2>
          <p className={p}>
            Shops don&apos;t pay to be listed or ranked. The cheapest in-stock price always comes
            first. The site is paid for by ads.
          </p>

          <h2 className={h2}>Spotted a wrong price?</h2>
          <p className={p}>
            Prices and stock change between our checks, so always confirm with the shop before you
            buy. If something looks wrong,{' '}
            <Link href="/contact" className="text-accent underline underline-offset-2">
              tell us
            </Link>{' '}
            and we&apos;ll fix it.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
