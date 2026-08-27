import Link from 'next/link'

import { AdminHeader, Dot, Panel } from '../components/AdminChrome'

import { CATEGORY_COPY, SHOP_SCHEDULE, rupees } from '@/lib/site'
import { getCatalogSummary, getShopSync } from '@/queries/admin'

export const dynamic = 'force-dynamic'

const nf = new Intl.NumberFormat('en-LK')

/** Pure: the age is measured in the query layer, this only formats it. */
function ago(hours: number): string {
  if (!Number.isFinite(hours)) return 'never'
  if (hours < 1) return `${Math.round(hours * 60)}m ago`
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default async function AdminOverview() {
  const [sync, summary] = await Promise.all([getShopSync(), getCatalogSummary()])
  const byShop = new Map(sync.map((s) => [s.shop, s]))
  const shops = Object.keys(SHOP_SCHEDULE)

  // Status is computed in the query layer, which is where reading the clock
  // belongs — a component that branches on the current time is not pure.
  const rows = shops.map((shop) => ({
    shop,
    schedule: SHOP_SCHEDULE[shop],
    sync: byShop.get(shop),
  }))

  const behind = rows.filter((r) => (r.sync?.tone ?? 'bad') !== 'ok')
  const pending = sync.reduce((n, s) => n + s.pending, 0)

  return (
    <>
      <AdminHeader current="overview" />

      <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-8 sm:px-8">
        <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Overview</h1>
        <p className="mt-2 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-3">
          {behind.length === 0
            ? 'Every shop has landed rows since its last scheduled run.'
            : `${behind.length} of ${rows.length} shops have not landed a row since their last scheduled run.`}
        </p>

        <div className="mt-6 grid gap-5">
          <Panel
            title="Sync health"
            hint={
              <>
                Times are when a row was last <em>landed</em>, not when a job was last attempted.
                A failed run and a run that found nothing new look identical from here — the
                scraper throws before writing, so nothing records the difference. Treat a red row
                as “go and read the Actions log”.
              </>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="hairline-b">
                    <th className="px-5 py-2.5 text-left font-medium text-ink-3">Shop</th>
                    <th className="px-3 py-2.5 text-left font-medium text-ink-3">Runs</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">Last row</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">24h</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">Pending</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">Listings</th>
                    <th className="px-5 py-2.5 text-right font-medium text-ink-3">In stock</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ shop, schedule, sync: s }) => {
                    const tone = s?.tone ?? 'bad'
                    return (
                    <tr key={shop} className="hairline-b">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2">
                          <Dot tone={tone} />
                          <span className="font-medium">{shop}</span>
                        </span>
                      </td>
                      <td className="mono px-3 py-3 text-[12px] text-ink-3">
                        {schedule.localLabel}
                      </td>
                      <td
                        className={`mono px-3 py-3 text-right text-[12px] ${
                          tone === 'ok' ? 'text-ink-2' : tone === 'warn' ? 'text-warn' : 'text-bad'
                        }`}
                      >
                        {ago(s?.lastScrapeAgeHours ?? Infinity)}
                      </td>
                      <td className="mono px-3 py-3 text-right text-[12px] text-ink-3">
                        {nf.format(s?.rowsLast24h ?? 0)}
                      </td>
                      <td
                        className={`mono px-3 py-3 text-right text-[12px] ${
                          (s?.pending ?? 0) > 0 ? 'text-warn' : 'text-ink-4'
                        }`}
                      >
                        {nf.format(s?.pending ?? 0)}
                      </td>
                      <td className="mono px-3 py-3 text-right text-[12px] text-ink-2">
                        {nf.format(s?.listings ?? 0)}
                      </td>
                      <td className="mono px-5 py-3 text-right text-[12px] text-ink-2">
                        {nf.format(s?.inStock ?? 0)}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pending > 0 && (
              <p className="bg-[var(--sunken)] px-5 py-3 text-[12.5px] text-ink-3">
                {nf.format(pending)} raw rows are waiting for the next normalize run (03:00).
              </p>
            )}
          </Panel>

          <Panel
            title="Catalogue"
            hint={`${nf.format(summary.totals.parts)} parts · ${nf.format(
              summary.totals.listings,
            )} listings · ${summary.totals.shops} shops · ${nf.format(
              summary.totals.rawRows,
            )} raw rows · ${nf.format(summary.totals.pricePoints)} price points over ${
              summary.totals.historyDays
            } days`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="hairline-b">
                    <th className="px-5 py-2.5 text-left font-medium text-ink-3">Category</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">Parts</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">Listings</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">In stock</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">Shops</th>
                    <th className="px-3 py-2.5 text-right font-medium text-ink-3">Price range</th>
                    <th className="px-5 py-2.5 text-right font-medium text-ink-3">Overrides</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.categories.map((c) => (
                    <tr key={c.category} className="hairline-b">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/gaps?category=${c.category}`}
                          className="font-medium underline-offset-2 hover:text-accent hover:underline"
                        >
                          {CATEGORY_COPY[c.category].heading}
                        </Link>
                      </td>
                      <td className="mono px-3 py-3 text-right text-[12px]">{nf.format(c.parts)}</td>
                      <td className="mono px-3 py-3 text-right text-[12px] text-ink-2">
                        {nf.format(c.listings)}
                      </td>
                      <td className="mono px-3 py-3 text-right text-[12px] text-ink-2">
                        {nf.format(c.inStock)}
                      </td>
                      <td className="mono px-3 py-3 text-right text-[12px] text-ink-3">{c.shops}</td>
                      <td className="mono px-3 py-3 text-right text-[11.5px] text-ink-3">
                        {c.cheapestLkr != null && c.dearestLkr != null
                          ? `${rupees(c.cheapestLkr)} – ${rupees(c.dearestLkr)}`
                          : '—'}
                      </td>
                      <td className="mono px-5 py-3 text-right text-[12px] text-ink-3">
                        {c.overrides || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Residue" hint="Rows the pipeline produced that nothing downstream uses.">
            <dl className="px-5 py-2">
              {[
                {
                  label: 'Parts with no listing',
                  value: summary.totals.orphanParts,
                  note: 'Dropped silently from the catalogue and the sitemap.',
                },
                {
                  label: 'Listings older than 7 days',
                  value: summary.totals.staleListings,
                  note: 'Excluded from the configurator; shown on part pages as last-seen.',
                },
                {
                  label: 'Manual overrides',
                  value: summary.totals.overrides,
                  note: 'Applied after the curated catalog on every run.',
                },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-baseline justify-between gap-4 border-b border-[var(--hairline)] py-3 last:border-b-0"
                >
                  <span>
                    <span className="text-[13px]">{r.label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-4">{r.note}</span>
                  </span>
                  <span className="mono text-[14px]">{nf.format(r.value)}</span>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  )
}
