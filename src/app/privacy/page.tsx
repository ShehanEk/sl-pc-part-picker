import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteFooter, SiteHeader } from '../components/SiteChrome'
import { SITE_NAME, canonical } from '@/lib/site'

/**
 * Google Analytics' terms require a notice of its cookies. There is no consent
 * popup by choice, so this page is that notice. Keep it true to what the site
 * actually does: if analytics or storage change, change this page with them.
 */

export const metadata: Metadata = {
  title: 'Privacy',
  description: `What ${SITE_NAME} measures, what it doesn't, and how to opt out.`,
  alternates: { canonical: canonical('/privacy') },
}

const h2 = 'm-0 text-[17px] font-semibold tracking-[-0.01em]'
const p = 'm-0 text-[15px] leading-relaxed text-ink-2'
const ul = 'm-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-ink-2'

export default function PrivacyPage() {
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
          <span aria-current="page">Privacy</span>
        </nav>

        <div className="flex flex-col gap-2 pb-6 pt-3">
          <h1 className="m-0 text-[clamp(30px,3.6vw,40px)] font-semibold tracking-[-0.035em]">
            Privacy
          </h1>
          <p className="m-0 text-[14px] text-ink-3">Last updated 20 October 2026</p>
        </div>

        <div className="glass flex flex-col gap-5 px-6 py-6 sm:px-7">
          <p className={p}>
            {SITE_NAME} compares PC part prices across Sri Lankan shops. You don&apos;t need an
            account, and we never ask for your name, email or phone number.
          </p>

          <h2 className={h2}>What we measure</h2>
          <p className={p}>
            We use Google Analytics to understand how the site is used, so we can make it more
            useful. It records:
          </p>
          <ul className={ul}>
            <li>which pages you view and which shop links you click</li>
            <li>your rough location (city or country), device, browser and the site that sent you</li>
          </ul>
          <p className={p}>
            Google Analytics sets cookies to tell one visit from another. It does not store your IP
            address, and we can&apos;t see who you are.
          </p>

          <h2 className={h2}>What we don&apos;t do</h2>
          <ul className={ul}>
            <li>No ads, and no advertising cookies.</li>
            <li>We never sell or share data with the shops we list.</li>
          </ul>

          <h2 className={h2}>Your PC build</h2>
          <p className={p}>
            The PC builder keeps your parts list in your browser for the current session only. It
            is never sent to us.
          </p>

          <h2 className={h2}>Shops we link to</h2>
          <p className={p}>
            When you click through to a shop, you&apos;re on their site and their privacy policy
            applies.
          </p>

          <h2 className={h2}>Opting out</h2>
          <p className={p}>
            You can block cookies in your browser settings, or install Google&apos;s{' '}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              className="text-accent underline underline-offset-2"
              rel="noopener"
            >
              Analytics opt-out add-on
            </a>
            . The site works the same either way.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
