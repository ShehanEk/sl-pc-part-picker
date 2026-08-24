import Link from 'next/link'


import {
  BUILD_SLOTS,
  SLOT_LABEL,
  evaluateBuild,
  suggestNextSlot,
  type Build,
  type BuildSlot,
} from '@/compat/build'
import type { CheckStatus } from '@/compat/rules'
import {
  encodeSlot,
  getOffersForPart,
  getSlotCounts,
  getSlotOptions,
  hydrateBuild,
  type PartOffer,
} from '@/queries/build'

const rs = (n: number) => `Rs ${n.toLocaleString('en-LK')}`

type SearchParams = Partial<Record<BuildSlot, string>> & { slot?: string; shops?: string }

/**
 * The configurator.
 *
 * The whole build lives in the query string, so a parts list can be shared as a
 * link — which is how people actually pass one to a friend or a shop. One slot
 * is active at a time, per the project's "one decision at a time" brief.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const build = await hydrateBuild(params)
  const report = evaluateBuild(build)
  const counts = await getSlotCounts()

  const suggestion = suggestNextSlot(build)
  const requested = params.slot as BuildSlot | undefined
  const activeSlot: BuildSlot | null =
    requested && BUILD_SLOTS.includes(requested) ? requested : (suggestion?.slot ?? null)

  const href = (over: Partial<Record<string, string | null>>) => {
    const next = new URLSearchParams()
    for (const s of BUILD_SLOTS) if (params[s]) next.set(s, params[s]!)
    for (const [k, v] of Object.entries(over)) {
      if (v === null) next.delete(k)
      else if (v !== undefined) next.set(k, v)
    }
    const q = next.toString()
    return q ? `/?${q}` : '/'
  }

  return (
    <main className="mx-auto w-full max-w-[46rem] px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="mb-8 px-1">
        <h1 className="large-title">Build a PC,<br />priced in Sri Lanka.</h1>
        <p className="mt-3 text-[1.0625rem] leading-snug text-label-secondary">
          Pick parts one at a time. We check they work together and show which local shop has
          each one cheapest — take them from whichever shops you like.
        </p>
      </header>

      <BuildPanel build={build} report={report} counts={counts} href={href} activeSlot={activeSlot} />

      {activeSlot && (
        <SlotChooser
          build={build}
          slot={activeSlot}
          suggestionMessage={suggestion?.slot === activeSlot ? suggestion.message : null}
          href={href}
          params={params}
        />
      )}

      {report.filled.length > 0 && <WhatWeDontCheck />}
    </main>
  )
}

function statusTone(status: CheckStatus) {
  return status === 'fail'
    ? 'text-red'
    : status === 'warn' || status === 'unknown'
      ? 'text-orange'
      : 'text-green'
}

async function BuildPanel({
  build,
  report,
  counts,
  href,
  activeSlot,
}: {
  build: Build
  report: ReturnType<typeof evaluateBuild>
  counts: Record<string, number>
  href: (o: Partial<Record<string, string | null>>) => string
  activeSlot: BuildSlot | null
}) {
  const shops = new Set(report.filled.map((s) => build[s]!.shop).filter(Boolean))

  return (
    <section className="mb-8">
      <h2 className="ios-section-header uppercase">Your build</h2>
      <ul className="ios-list">
        {BUILD_SLOTS.map((slot) => {
          const part = build[slot]
          const isActive = slot === activeSlot
          return (
            <li key={slot}>
              <Link
                href={href({ slot })}
                className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors active:bg-fill ${
                  isActive ? 'bg-fill' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] capitalize text-label-secondary">
                    {SLOT_LABEL[slot]}
                  </span>
                  <span
                    className={`block truncate text-[1.0625rem] ${
                      part ? '' : 'text-label-tertiary'
                    }`}
                  >
                    {part ? part.model : `Choose — ${counts[slot] ?? 0} in stock`}
                  </span>
                  {part?.shop && (
                    <span className="block text-[0.8125rem] text-label-secondary">
                      {part.shop}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {part?.priceLkr != null && (
                    <span className="text-[1.0625rem] tabular-nums">{rs(part.priceLkr)}</span>
                  )}
                  <Chevron />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      {report.filled.length > 0 && (
        <div className="mt-2.5 rounded-[var(--radius)] bg-surface px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[1.0625rem] font-semibold">Total so far</span>
            <span className="text-[1.375rem] font-semibold tabular-nums">
              {rs(report.totalLkr)}
            </span>
          </div>
          <p className="mt-1 text-[0.8125rem] text-label-secondary">
            {report.filled.length} of {BUILD_SLOTS.length} parts
            {shops.size > 0 && <> · from {shops.size} {shops.size === 1 ? 'shop' : 'shops'}</>}
          </p>

          {(report.checks.length > 0 || report.pending.length > 0) && (
            <ul className="mt-3 space-y-1.5 border-t border-separator pt-3">
              {report.checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-[0.8125rem] leading-snug">
                  <Dot className={`mt-[0.4rem] shrink-0 ${statusTone(c.status).replace('text-', 'bg-')}`} />
                  <span className={c.status === 'pass' ? 'text-label-secondary' : statusTone(c.status)}>
                    {c.message}
                  </span>
                </li>
              ))}
              {report.pending.map((p) => (
                <li key={p.id} className="flex gap-2 text-[0.8125rem] leading-snug text-label-tertiary">
                  <Dot className="mt-[0.4rem] shrink-0 bg-label-tertiary" />
                  <span>{p.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

async function SlotChooser({
  build,
  slot,
  suggestionMessage,
  href,
  params,
}: {
  build: Build
  slot: BuildSlot
  suggestionMessage: string | null
  href: (o: Partial<Record<string, string | null>>) => string
  params: SearchParams
}) {
  const options = await getSlotOptions(build, slot)
  const chosen = build[slot]
  const expandShopsFor = params.shops

  return (
    <section>
      <h2 className="ios-section-header uppercase">Choose a {SLOT_LABEL[slot]}</h2>

      <div className="mb-2.5 rounded-[var(--radius)] bg-surface px-4 py-3">
        <p className="text-[0.9375rem] leading-snug">
          {suggestionMessage ?? `${options.fitting.length} of ${options.total} in stock will work.`}
        </p>
        {options.blocked.length > 0 && (
          <p className="mt-1 text-[0.8125rem] text-label-secondary">
            {options.blocked.length} hidden because they don&apos;t fit — {options.blocked[0].blockedBy}
          </p>
        )}
        {chosen && (
          <Link
            href={href({ [slot]: null, shops: null })}
            className="mt-2 inline-block text-[0.9375rem] text-blue"
          >
            Remove {chosen.model}
          </Link>
        )}
      </div>

      {options.fitting.length === 0 ? (
        <div className="rounded-[var(--radius)] bg-surface px-4 py-5 text-[0.9375rem] text-label-secondary">
          Nothing in stock fits the parts you&apos;ve chosen. Try changing another slot.
        </div>
      ) : (
        <ul className="ios-list">
          {options.fitting.slice(0, 25).map((o) => (
            <OptionRow
              key={o.part.partId}
              option={o.part}
              caveat={o.checks.find((c) => c.status === 'unknown' || c.status === 'warn')?.message}
              selected={chosen?.partId === o.part.partId}
              href={href}
              slot={slot}
              expanded={expandShopsFor === o.part.partId}
              chosenShop={chosen?.partId === o.part.partId ? (chosen.shop ?? null) : null}
            />
          ))}
        </ul>
      )}

      {options.fitting.length > 25 && (
        <p className="ios-section-header pt-2">
          and {options.fitting.length - 25} more that fit.
        </p>
      )}
    </section>
  )
}

async function OptionRow({
  option,
  caveat,
  selected,
  href,
  slot,
  expanded,
  chosenShop,
}: {
  option: PartOffer
  caveat: string | undefined
  selected: boolean
  href: (o: Partial<Record<string, string | null>>) => string
  slot: BuildSlot
  expanded: boolean
  chosenShop: string | null
}) {
  const specs = [
    option.socket,
    option.ramType,
    option.capacityGb ? `${option.capacityGb}GB` : null,
    option.speedMhz ? `${option.speedMhz}MHz` : null,
    option.vramGb ? `${option.vramGb}GB` : null,
    option.tdpWatts ? `${option.tdpWatts}W` : null,
    option.ratedWatts ? `${option.ratedWatts}W` : null,
  ]
    .filter(Boolean)
    .slice(0, 3)

  const offers = expanded ? await getOffersForPart(option.partId) : []

  return (
    <li>
      <Link
        href={href({ [slot]: encodeSlot(option.partId, option.shop ?? ''), shops: null })}
        className="flex items-start justify-between gap-3 px-4 py-3 transition-colors active:bg-fill"
      >
        <span className="min-w-0">
          <span className="block truncate text-[1.0625rem]">
            {selected && <span className="mr-1.5 text-blue">✓</span>}
            {option.model}
          </span>
          <span className="block text-[0.8125rem] text-label-secondary">
            {[option.brand, ...specs].filter(Boolean).join(' · ')}
          </span>
          <span className="block text-[0.8125rem] text-label-secondary">
            {chosenShop ?? option.shop}
          </span>
          {caveat && (
            <span className="mt-0.5 block text-[0.8125rem] leading-snug text-label-tertiary">
              {caveat}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-[1.0625rem] tabular-nums">{rs(option.priceLkr ?? 0)}</span>
          <Chevron />
        </span>
      </Link>

      {option.shopCount > 1 && (
        <div className="px-4 pb-2.5">
          <Link
            href={href({ shops: expanded ? null : option.partId })}
            className="text-[0.8125rem] text-blue"
          >
            {expanded ? 'Hide' : `Compare ${option.shopCount} shops`}
          </Link>
          {expanded && (
            <ul className="mt-1.5 space-y-1">
              {offers.map((o) => (
                <li key={o.shop}>
                  <Link
                    href={href({ [slot]: encodeSlot(option.partId, o.shop), shops: null })}
                    className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[0.8125rem] ${
                      o.inStock ? '' : 'opacity-55'
                    } ${chosenShop === o.shop ? 'bg-fill' : ''}`}
                  >
                    <span>
                      {o.shop}
                      {!o.inStock && (
                        <span className="ml-1.5 text-label-tertiary">· out of stock</span>
                      )}
                    </span>
                    <span className="tabular-nums">{rs(o.priceLkr)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function WhatWeDontCheck() {
  return (
    <section className="mt-8">
      <h2 className="ios-section-header uppercase">What we don&apos;t check</h2>
      <div className="rounded-[var(--radius)] bg-surface px-4 py-3.5 text-[0.8125rem] leading-relaxed text-label-secondary">
        <p>
          We check sockets, memory type and power. We don&apos;t check whether the card and
          cooler physically fit the case, or that you have storage — those specs aren&apos;t
          published in local listings, so we&apos;d be guessing.
        </p>
      </div>
    </section>
  )
}

function Dot({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${className}`} />
}

function Chevron() {
  return (
    <svg viewBox="0 0 8 13" className="h-3 w-2 shrink-0 text-label-tertiary" fill="none" aria-hidden="true">
      <path d="M1.5 1.5 6.5 6.5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

