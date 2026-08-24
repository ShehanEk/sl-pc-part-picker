import { Configurator } from './components/Configurator'

import { getCatalogStats, loadCatalogue } from '@/queries/build'

const nf = new Intl.NumberFormat('en-LK')

export default async function Home() {
  const [catalogue, stats] = await Promise.all([loadCatalogue(), getCatalogStats()])

  const checked = stats.lastScrape
    ? new Date(stats.lastScrape).toLocaleString('en-LK', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null

  return (
    <>
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <div className="flex items-baseline gap-3">
          <span className="text-[17.5px] font-bold tracking-[-0.025em]">
            PC Maker<span className="text-accent">.lk</span>
          </span>
          <span className="hidden text-[12.5px] text-ink-3 sm:inline">
            PC prices &amp; stock, Sri Lanka
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="mono hidden items-center gap-4 px-1 py-1.5 text-[11px] text-ink-3 lg:flex">
            <span>{nf.format(stats.parts)} parts</span>
            <span>{nf.format(stats.listings)} listings</span>
            <span>{stats.shops} shops</span>
          </span>
          {checked && (
            <span className="mono flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-white/90 px-3 py-1.5 text-[11px] text-ink-3">
              <span
                className="h-1.5 w-1.5 rounded-full bg-ok"
                style={{ boxShadow: '0 0 8px oklch(0.75 0.18 152)' }}
              />
              live {checked}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-[1300px] px-5 pb-4 pt-10 sm:px-8 sm:pt-14">
        <h1 className="display m-0">Build a PC, priced in Sri&nbsp;Lanka.</h1>
        <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.5] text-ink-2 [text-wrap:pretty]">
          Pick one part at a time. We keep the build compatible and show which local shop has
          each one cheapest.
        </p>
      </div>

      <Configurator catalogue={catalogue} />
    </>
  )
}
