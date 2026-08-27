import Link from 'next/link'

import { AdminHeader, Panel } from '../../components/AdminChrome'

import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { CHECK_LABEL } from '@/catalog/gaps'
import { CATEGORY_COPY } from '@/lib/site'
import { listGaps } from '@/queries/admin'

export const dynamic = 'force-dynamic'

const nf = new Intl.NumberFormat('en-LK')

function asSlot(v: string | undefined): BuildSlot | undefined {
  return v && (BUILD_SLOTS as string[]).includes(v) ? (v as BuildSlot) : undefined
}

export default async function GapsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const category = asSlot((await searchParams).category)
  const { rows, totalParts, totalCells } = await listGaps(category)

  return (
    <>
      <AdminHeader current="gaps" />

      <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-8 sm:px-8">
        <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Missing data</h1>
        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-relaxed text-ink-3">
          Only fields a compatibility rule actually reads. Values that are correctly absent are
          not listed — a processor on LGA1700 has no memory generation of its own, because the
          board decides, so those are settled rather than missing.
        </p>
        <p className="mt-3 max-w-[72ch] rounded-[var(--radius-sm)] border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] px-4 py-3 text-[12.5px] leading-relaxed text-[oklch(0.42_0.12_258)]">
          <strong>{nf.format(totalCells)} empty cells across {nf.format(totalParts)} parts.</strong>{' '}
          Do not try to clear it. Sorted by how many shops stock the part, so the top few dozen
          are the ones that turn up in real builds — filling those is most of the value.
        </p>

        <div className="mt-5 mb-4 flex flex-wrap gap-2">
          <Link
            href="/admin/gaps"
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
              !category
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--glass-border)] bg-white/80 text-ink-2'
            }`}
          >
            All
          </Link>
          {BUILD_SLOTS.map((slot) => (
            <Link
              key={slot}
              href={`/admin/gaps?category=${slot}`}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] capitalize transition ${
                category === slot
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--glass-border)] bg-white/80 text-ink-2'
              }`}
            >
              {CATEGORY_COPY[slot].heading}
            </Link>
          ))}
        </div>

        <Panel
          title={category ? `${CATEGORY_COPY[category].heading} gaps` : 'Most-stocked parts first'}
          hint={`Showing ${rows.length} of ${nf.format(totalParts)} parts with at least one gap.`}
        >
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-[13.5px] text-ink-3">
              Nothing missing here. Every rule-relevant field is filled.
            </p>
          ) : (
            rows.map((r) => (
              <Link
                key={r.partId}
                href={`/admin/parts/${r.partId}`}
                className="hairline-b row-tap flex items-start gap-4 px-5 py-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[14px] tracking-[-0.015em]">{r.model}</span>
                    <span className="mono rounded-full bg-[rgb(30_50_100/5%)] px-2 py-[3px] text-[10px] text-ink-2">
                      {r.brand}
                    </span>
                    {r.hasOverride && (
                      <span className="rounded-full bg-[var(--accent-soft)] px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
                        edited
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.gaps.map((g) => (
                      <span
                        key={g.field}
                        className="rounded-full border border-[var(--glass-border)] px-2 py-[3px] text-[10.5px] text-ink-3"
                        title={g.unblocks ? `Unblocks: ${CHECK_LABEL[g.unblocks]}` : undefined}
                      >
                        {g.label}
                        {g.unblocks && (
                          <span className="text-ink-4"> → {CHECK_LABEL[g.unblocks]}</span>
                        )}
                      </span>
                    ))}
                  </span>
                </span>

                <span className="w-[92px] flex-none text-right">
                  <span className="mono block text-[13px]">
                    {r.inStockShops}/{r.shops}
                  </span>
                  <span className="block text-[10.5px] text-ink-4">shops in stock</span>
                </span>
              </Link>
            ))
          )}
        </Panel>
      </div>
    </>
  )
}
