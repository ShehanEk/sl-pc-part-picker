import { PartPicker } from './components/PartPicker'
import { Sparkline } from './components/Sparkline'

import {
  getCatalogStats,
  getPart,
  getPriceSeries,
  getPsuOptionsFor,
  getShopListings,
  listPartsForPicker,
  type PartDetail,
  type PsuOption,
} from '@/queries/parts'

export const dynamic = 'force-dynamic'

const rs = (n: number) => `Rs ${n.toLocaleString('en-LK')}`

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>
}) {
  const { part: selectedId } = await searchParams
  const [gpus, stats] = await Promise.all([listPartsForPicker('gpu'), getCatalogStats()])
  const part = selectedId ? await getPart(selectedId) : null

  return (
    <main className="mx-auto w-full max-w-[42rem] px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
      <header className="mb-9 px-1">
        <h1 className="large-title">PC parts,<br />priced in Sri Lanka.</h1>
        <p className="mt-3 text-[1.0625rem] leading-snug text-label-secondary">
          Every price below is from a shop here. Pick a card and we&apos;ll work out what can
          power it.
        </p>
      </header>

      <PartPicker parts={gpus} selected={selectedId ?? null} />

      {part ? (
        <PartView part={part} />
      ) : (
        <p className="mt-8 px-1 text-[0.9375rem] text-label-secondary">
          {gpus.length} graphics cards tracked across {stats.shops} shops.
        </p>
      )}

      <footer className="mt-14 px-1 text-[0.8125rem] leading-relaxed text-label-tertiary">
        {stats.parts} parts · {stats.listings} live listings · {stats.shops} shops
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

async function PartView({ part }: { part: PartDetail }) {
  const [shops, series, psus] = await Promise.all([
    getShopListings(part.partId),
    getPriceSeries(part.partId),
    part.category === 'gpu' ? getPsuOptionsFor(part) : Promise.resolve(null),
  ])

  // The headline has to be a price someone can actually pay. Most parts here
  // have an out-of-stock listing as their cheapest, so quoting the raw minimum
  // would advertise a number no shop will honour.
  const cheapestInStock = shops.find((s) => s.inStock) ?? null
  const cheapestListed = shops[0] ?? null

  const specs = [
    part.tdpWatts !== null && `${part.tdpWatts}W`,
    part.vramGb !== null && `${part.vramGb}GB`,
    part.powerConnector && connectorLabel(part.powerConnector),
    part.lengthMm !== null && `${part.lengthMm}mm`,
  ].filter(Boolean) as string[]

  return (
    <div className="mt-9 space-y-9">
      <section className="rounded-[var(--radius)] bg-surface px-5 py-6">
        <h2 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]">
          {part.model}
        </h2>
        {specs.length > 0 && (
          <p className="mt-1.5 text-[0.9375rem] text-label-secondary">{specs.join(' · ')}</p>
        )}

        {cheapestInStock ? (
          <>
            <p className="mt-5 text-[2.5rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              {rs(cheapestInStock.priceLkr)}
            </p>
            <p className="mt-2 text-[0.9375rem] text-label-secondary">
              <Dot className="bg-green" /> In stock at {cheapestInStock.shop}
            </p>
          </>
        ) : cheapestListed ? (
          <>
            <p className="mt-5 text-[2.5rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-label-tertiary">
              {rs(cheapestListed.priceLkr)}
            </p>
            <p className="mt-2 text-[0.9375rem] text-orange">
              <Dot className="bg-orange" /> Out of stock everywhere — last listed price, not one you
              can pay today.
            </p>
          </>
        ) : (
          <p className="mt-5 text-[0.9375rem] text-label-secondary">No shop is listing this.</p>
        )}

        <div className="mt-5 border-t border-separator pt-4">
          <Sparkline points={series} />
        </div>
      </section>

      <section>
        <h3 className="ios-section-header uppercase">Available at</h3>
        <ul className="ios-list">
          {shops.map((s) => (
            <li key={s.shop}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors active:bg-fill"
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[1.0625rem] ${s.inStock ? '' : 'text-label-secondary'}`}>
                    {s.shop}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-label-secondary">
                    {s.inStock ? 'In stock' : 'Out of stock'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  {/* Only ever badge something you can buy. */}
                  {s === cheapestInStock && shops.length > 1 && (
                    <Pill tone="green">Best price</Pill>
                  )}
                  <span
                    className={`text-[1.0625rem] tabular-nums ${
                      s.inStock ? '' : 'text-label-tertiary'
                    }`}
                  >
                    {rs(s.priceLkr)}
                  </span>
                  <Chevron />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {psus && <PsuSection psus={psus} gpuModel={part.model} />}
    </div>
  )
}

function PsuSection({
  psus,
  gpuModel,
}: {
  psus: NonNullable<Awaited<ReturnType<typeof getPsuOptionsFor>>>
  gpuModel: string
}) {
  if (psus.requiredWatts === null) {
    return (
      <section>
        <h3 className="ios-section-header uppercase">Power supplies</h3>
        <div className="rounded-[var(--radius)] bg-surface px-4 py-4 text-[0.9375rem] text-label-secondary">
          We don&apos;t have the power draw for the {gpuModel} yet, so we can&apos;t work out which
          PSUs will run it.
        </div>
      </section>
    )
  }

  const byPrice = psus.options.slice(0, 8)

  // The cheapest options are usually the ones we have no connector data for, so
  // a buyer who wants certainty would never see a verified unit. Pin the
  // cheapest fully-checked option into the list when it falls outside the top
  // eight, rather than reordering and burying the genuinely cheapest.
  const cheapestVerified = psus.options.find((o) => o.status === 'pass') ?? null
  const pinned = cheapestVerified && !byPrice.includes(cheapestVerified) ? cheapestVerified : null
  const shown = pinned ? [...byPrice, pinned] : byPrice

  const allShareConnectorCaveat =
    shown.length > 1 &&
    shown.every((o) => o.checks.some((c) => c.id === 'gpu-connector' && c.status === 'unknown'))

  return (
    <section>
      <h3 className="ios-section-header uppercase">Power supplies that can run it</h3>

      <div className="mb-2.5 rounded-[var(--radius)] bg-surface px-4 py-3.5">
        <p className="text-[0.9375rem] leading-snug">
          Needs about <strong className="font-semibold">{psus.requiredWatts}W</strong>
          <span className="text-label-secondary"> — {psus.requiredBasis}.</span>
        </p>
        {psus.failing > 0 && (
          <p className="mt-1 text-[0.8125rem] text-label-secondary">
            {psus.failing} in-stock supplies are too weak and are hidden.
          </p>
        )}
        {/* Every PSU shown shares the same caveat, so say it once rather than
            repeating it on all eight rows. */}
        {allShareConnectorCaveat && (
          <p className="mt-2 flex gap-2 text-[0.8125rem] leading-snug text-orange">
            <Dot className="mt-[0.4rem] shrink-0 bg-orange" />
            <span>
              Wattage checked, connectors not. We don&apos;t have published connector lists for
              these yet — confirm the card&apos;s plug before buying.
            </span>
          </p>
        )}
      </div>

      <ul className="ios-list">
        {shown.map((o) => (
          <PsuRow
            key={o.partId}
            option={o}
            hideCaveat={allShareConnectorCaveat}
            verified={o === cheapestVerified}
          />
        ))}
      </ul>

      {psus.options.length > byPrice.length && (
        <p className="ios-section-header pt-2">
          and {psus.options.length - byPrice.length} more that fit.
        </p>
      )}
    </section>
  )
}

function PsuRow({
  option,
  hideCaveat,
  verified,
}: {
  option: PsuOption
  hideCaveat?: boolean
  verified?: boolean
}) {
  // Only surface caveats. A clean pass needs no explanation; anything less does.
  // Kept terse and in the secondary label colour: neither missing connector
  // data nor a bundled adapter is a hazard, and colouring them warning-orange
  // on every row shouts about something that is merely worth knowing.
  const caveat = hideCaveat
    ? undefined
    : option.checks.find((c) => c.status === 'unknown' || c.status === 'warn')
  const caveatText =
    caveat?.id === 'gpu-connector'
      ? caveat.status === 'warn'
        ? 'Uses the adapter supplied with the card'
        : 'Connectors not published — check before buying'
      : caveat?.message

  return (
    <li>
      <a
        href={option.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-start justify-between gap-4 px-4 py-3 transition-colors active:bg-fill"
      >
        <span className="min-w-0">
          <span className="block truncate text-[1.0625rem]">
            {option.brand} {option.model}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] text-label-secondary">
            {option.ratedWatts}W
            {option.efficiencyRating && <> · {option.efficiencyRating}</>} · {option.shop}
          </span>
          {caveatText && (
            <span className="mt-0.5 block text-[0.8125rem] leading-snug text-label-tertiary">
              {caveatText}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2.5 pt-0.5">
          {option.cheapestFit && <Pill tone="blue">Cheapest fit</Pill>}
          {verified && <Pill tone="green">Verified</Pill>}
          <span className="text-[1.0625rem] tabular-nums">{rs(option.cheapestLkr)}</span>
          <Chevron />
        </span>
      </a>
    </li>
  )
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'blue' | 'green' }) {
  const color = tone === 'blue' ? 'text-blue' : 'text-green'
  return (
    <span
      className={`rounded-full bg-fill px-2 py-[0.1875rem] text-[0.6875rem] font-semibold uppercase tracking-[0.03em] ${color}`}
    >
      {children}
    </span>
  )
}

/** The small status dot Apple uses instead of an icon for inline state. */
function Dot({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${className}`} />
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 8 13"
      className="h-3 w-2 shrink-0 text-label-tertiary"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 1.5 6.5 6.5l-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function connectorLabel(c: string) {
  switch (c) {
    case '8pin':
      return '8-pin power'
    case '2x8pin':
      return '2× 8-pin power'
    case '12vhpwr':
      return '12VHPWR'
    case '12v-2x6':
      return '12V-2×6'
    default:
      return c
  }
}
