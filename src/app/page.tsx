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
      {/* Kept short on purpose: on a phone the previous four-line intro pushed
          the build itself below the fold. The longer explanation only appears
          where there is room for it. */}
      <header className="mb-7 px-1">
        <h1 className="large-title">Build a PC,<br />priced in Sri Lanka.</h1>
        <p className="mt-3 text-[1.0625rem] leading-snug text-label-secondary">
          Parts that work together, from local shops.
          <span className="hidden sm:inline">
            {' '}Pick one at a time — we check compatibility and show who has each cheapest.
          </span>
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

/**
 * Written out in full rather than derived.
 *
 * These class names have to appear literally in the source for Tailwind to
 * generate them. Building them with `'text-green'.replace('text-','bg-')`
 * produced markup referencing a `bg-green` rule that was never emitted, so
 * every status dot rendered transparent.
 */
const TONE: Record<CheckStatus, { text: string; dot: string }> = {
  pass: { text: 'text-green', dot: 'bg-green' },
  fail: { text: 'text-red', dot: 'bg-red' },
  warn: { text: 'text-orange', dot: 'bg-orange' },
  unknown: { text: 'text-orange', dot: 'bg-orange' },
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
                  <Dot className={`mt-[0.4rem] shrink-0 ${TONE[c.status].dot}`} />
                  <span className={c.status === 'pass' ? 'text-label-secondary' : TONE[c.status].text}>
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

  const shown = options.fitting.slice(0, 25)
  const caveatOf = (o: (typeof shown)[number]) =>
    o.checks.find((c) => c.status === 'unknown' || c.status === 'warn')

  /**
   * Rows carry a short tag, not a sentence.
   *
   * On a phone the full wording cost two lines on every row — the same
   * explanation repeated down 24 options, roughly 860px of identical text and
   * more than a whole screen, which pushed the actual choices out of view. The
   * reasoning belongs once, above the list; the row only needs to flag that
   * there is a reservation.
   */
  const shortCaveat = (o: (typeof shown)[number]): string | undefined => {
    const c = caveatOf(o)
    if (!c) return undefined
    if (c.id === 'gpu-connector') {
      return c.status === 'warn' ? 'Uses the bundled adapter' : 'Connectors not published'
    }
    if (c.id === 'ram-fits') return 'Slot count not published'
    if (c.id === 'ram-speed') return 'Rated speed not published'
    return c.message
  }

  // The long form, said once, when most of the list shares a reservation.
  const majorityCaveat = (() => {
    const counts = new Map<string, number>()
    for (const o of shown) {
      const m = caveatOf(o)?.message
      if (m) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    return top && top[1] >= Math.max(2, shown.length / 2) ? top[0] : null
  })()

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
        {majorityCaveat && (
          <p className="mt-2 flex gap-2 text-[0.8125rem] leading-snug text-orange">
            <Dot className="mt-[0.4rem] shrink-0 bg-orange" />
            <span>{majorityCaveat}</span>
          </p>
        )}
        {chosen && (
          <Link
            href={href({ [slot]: null, shops: null })}
            className="-mx-1 mt-1 inline-block px-1 py-2 text-[0.9375rem] text-blue"
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
          {shown.map((o) => (
            <OptionRow
              key={o.part.partId}
              option={o.part}
              caveat={shortCaveat(o)}
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
        <div className="px-4 pb-1.5">
          {/* Padded to a 44px target: the bare text link was 17px tall, well
              under what a thumb can reliably hit. */}
          <Link
            href={href({ shops: expanded ? null : option.partId })}
            className="-mx-2 inline-block px-2 py-3 text-[0.8125rem] text-blue"
          >
            {expanded ? 'Hide' : `Compare ${option.shopCount} shops`}
          </Link>
          {expanded && (
            <ul className="mt-1.5 space-y-1">
              {offers.map((o) => (
                <li key={o.shop}>
                  <Link
                    href={href({ [slot]: encodeSlot(option.partId, o.shop), shops: null })}
                    className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-[0.8125rem] ${
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

