import { Configurator } from './components/Configurator'

import { getCatalogStats, loadCatalogue } from '@/queries/build'

/**
 * Thin shell. The catalogue is fetched once on the server and the whole
 * interaction happens in the browser, so picking a part is instant rather than
 * a navigation.
 */
export default async function Home() {
  const [catalogue, stats] = await Promise.all([loadCatalogue(), getCatalogStats()])

  return (
    <main className="mx-auto w-full max-w-[46rem] px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      {/* Kept short on purpose: on a phone a longer intro pushed the build
          itself below the fold. */}
      <header className="mb-7 px-1">
        <h1 className="large-title">Build a PC,<br />priced in Sri Lanka.</h1>
        <p className="mt-3 text-[1.0625rem] leading-snug text-label-secondary">
          Parts that work together, from local shops.
          <span className="hidden sm:inline">
            {' '}Pick one at a time — we check compatibility and show who has each cheapest.
          </span>
        </p>
      </header>

      <Configurator catalogue={catalogue} />

      <footer className="mt-14 px-1 text-[0.8125rem] leading-relaxed text-label-tertiary">
        {stats.parts} parts · {stats.listings} listings · {stats.shops} shops
        {stats.lastScrape && (
          <>
            <br />
            Last checked {new Date(stats.lastScrape).toLocaleString('en-LK')}
          </>
        )}
      </footer>
    </main>
  )
}
