import type { Metadata } from 'next'

import { Configurator } from '../components/Configurator'
import { SiteFooter, SiteHeader } from '../components/SiteChrome'

import { SITE_NAME, TRACKED_SHOPS, canonical } from '@/lib/site'
import { loadCatalogue } from '@/queries/build'

/**
 * The PC builder. It used to be the home page; the home page is now about
 * finding the cheapest shop for one part, which is what most visitors want,
 * and the builder is one click away in the header for the ones building a
 * whole machine.
 */
export const revalidate = 1800

export const metadata: Metadata = {
  title: 'PC builder: build a PC from parts in stock in Sri Lanka',
  description: `Build a PC from parts Sri Lankan shops actually stock. Mix parts from ${TRACKED_SHOPS.join(
    ', ',
  )}, and we check they work together and total the cheapest shop for each.`,
  alternates: { canonical: canonical('/build') },
  openGraph: {
    title: `PC builder | ${SITE_NAME}`,
    description: 'Build a PC from parts in stock in Sri Lanka, checked for compatibility.',
    url: canonical('/build'),
    type: 'website',
  },
}

export default async function BuildPage() {
  const catalogue = await loadCatalogue()

  return (
    <>
      <SiteHeader />

      <div className="mx-auto max-w-[1300px] px-5 pb-4 pt-10 sm:px-8 sm:pt-14">
        <h1 className="display m-0">Build a PC, priced in Sri&nbsp;Lanka.</h1>
        <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.5] text-ink-2 [text-wrap:pretty]">
          Pick one part at a time. We keep the build compatible and show which local shop has
          each one cheapest.
        </p>
      </div>

      <Configurator catalogue={catalogue} />

      <SiteFooter />
    </>
  )
}
