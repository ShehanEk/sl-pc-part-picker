import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteFooter, SiteHeader } from '../components/SiteChrome'
import { SITE_NAME, canonical } from '@/lib/site'

const EMAIL = 'hello@pcprice.lk'

export const metadata: Metadata = {
  title: 'Contact',
  description: `How to reach ${SITE_NAME}: report a wrong price, ask for a shop to be added, or send an idea.`,
  alternates: { canonical: canonical('/contact') },
}

const h2 = 'm-0 text-[17px] font-semibold tracking-[-0.01em]'
const p = 'm-0 text-[15px] leading-relaxed text-ink-2'
const ul = 'm-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-ink-2'

export default function ContactPage() {
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
          <span aria-current="page">Contact</span>
        </nav>

        <h1 className="m-0 pb-6 pt-3 text-[clamp(30px,3.6vw,40px)] font-semibold tracking-[-0.035em]">
          Contact
        </h1>

        <div className="glass flex flex-col gap-5 px-6 py-6 sm:px-7">
          <p className={p}>
            Email{' '}
            <a href={`mailto:${EMAIL}`} className="mono text-accent underline underline-offset-2">
              {EMAIL}
            </a>
            .
          </p>

          <h2 className={h2}>Good reasons to write</h2>
          <ul className={ul}>
            <li>A price, stock status or part on the site is wrong. Include the page link.</li>
            <li>You run a shop and want it added, or want a listing changed or removed.</li>
            <li>The PC builder said two parts fit when they don&apos;t, or the other way round.</li>
            <li>An idea that would make the site more useful.</li>
          </ul>

          <h2 className={h2}>What we can&apos;t help with</h2>
          <p className={p}>
            Orders, delivery, warranty and returns are handled by the shop you bought from. Contact
            them directly.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
