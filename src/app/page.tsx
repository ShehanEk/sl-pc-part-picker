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

/**
 * The whole app: pick a card, see what it costs locally, see what can power it.
 * One decision at a time, per the project spec.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>
}) {
  const { part: selectedId } = await searchParams
  const [gpus, stats] = await Promise.all([listPartsForPicker('gpu'), getCatalogStats()])
  const part = selectedId ? await getPart(selectedId) : null

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">SL PC Parts Tracker</h1>
        <p className="mt-1 text-black/55 dark:text-white/55">
          What PC parts actually cost in Sri Lanka, and what works together.
        </p>
      </header>

      <PartPicker parts={gpus} selected={selectedId ?? null} />

      {!part ? (
        <p className="mt-10 text-black/50 dark:text-white/50">
          {gpus.length} graphics cards in stock across {stats.shops} local shops.
        </p>
      ) : (
        <PartView part={part} />
      )}

      <footer className="mt-16 border-t border-black/10 pt-5 text-sm text-black/45 dark:border-white/10 dark:text-white/45">
        {stats.parts} parts · {stats.listings} live listings · {stats.shops} shops
        {stats.lastScrape && <> · last checked {new Date(stats.lastScrape).toLocaleString('en-LK')}</>}
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

  return (
    <div className="mt-10 space-y-10">
      <section>
        <h2 className="text-xl font-semibold">{part.model}</h2>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-black/55 dark:text-white/55">
          <span>{part.brand}</span>
          {part.tdpWatts !== null && <span>{part.tdpWatts}W draw</span>}
          {part.powerConnector && <span>{connectorLabel(part.powerConnector)}</span>}
          {part.lengthMm !== null && <span>{part.lengthMm}mm long</span>}
        </div>

        {cheapestInStock ? (
          <p className="mt-4 text-3xl font-semibold tracking-tight">
            {rs(cheapestInStock.priceLkr)}{' '}
            <span className="text-base font-normal text-black/50 dark:text-white/50">
              in stock at {cheapestInStock.shop}
            </span>
          </p>
        ) : cheapestListed ? (
          <div className="mt-4">
            <p className="text-3xl font-semibold tracking-tight text-black/40 dark:text-white/40">
              {rs(cheapestListed.priceLkr)}
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-500">
              Out of stock everywhere we track — that is the last listed price, not one you can pay
              today.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-black/50 dark:text-white/50">No shop is listing this right now.</p>
        )}

        <div className="mt-4">
          <Sparkline points={series} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Available at
        </h3>
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {shops.map((s) => (
            <li
              key={s.shop}
              className={`flex items-center justify-between gap-4 py-3 ${
                s.inStock ? '' : 'opacity-55'
              }`}
            >
              <div className="min-w-0">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-black/20 underline-offset-4 hover:decoration-black/60 dark:decoration-white/25"
                >
                  {s.shop}
                </a>
                {!s.inStock && (
                  <span className="ml-2 text-sm text-black/50 dark:text-white/50">
                    · out of stock
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {/* Only ever badge something you can buy. */}
                {s === cheapestInStock && shops.length > 1 && <Badge>Best price</Badge>}
                <span className="tabular-nums">{rs(s.priceLkr)}</span>
              </div>
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
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Power supplies
        </h3>
        <p className="text-black/55 dark:text-white/55">
          We don&apos;t have the power draw for the {gpuModel} yet, so we can&apos;t work out which
          PSUs will run it.
        </p>
      </section>
    )
  }

  const byPrice = psus.options.slice(0, 8)

  // The cheapest options are usually the ones we have no connector data for, so
  // a buyer who wants certainty would never see a verified unit. Pin the
  // cheapest fully-checked option into the list when it falls outside the top
  // eight, rather than reordering and burying the genuinely cheapest.
  const cheapestVerified = psus.options.find((o) => o.status === 'pass') ?? null
  const pinned =
    cheapestVerified && !byPrice.includes(cheapestVerified) ? cheapestVerified : null
  const shown = pinned ? [...byPrice, pinned] : byPrice

  const allShareConnectorCaveat =
    shown.length > 1 &&
    shown.every((o) => o.checks.some((c) => c.id === 'gpu-connector' && c.status === 'unknown'))

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
        Power supplies that can run it
      </h3>
      <p className="mb-2 text-sm text-black/55 dark:text-white/55">
        Needs about <strong className="font-medium">{psus.requiredWatts}W</strong> ({psus.requiredBasis}).
        {psus.failing > 0 && <> {psus.failing} in-stock PSUs are too weak and are hidden.</>}
      </p>

      {/* Every PSU currently shares the same caveat, so say it once rather than
          repeating it on all eight rows. */}
      {allShareConnectorCaveat && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
          Wattage checked, connectors not. We don&apos;t have published connector lists for these
          PSUs yet, so confirm the card&apos;s plug before buying.
        </p>
      )}

      <ul className="divide-y divide-black/10 dark:divide-white/10">
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
        <p className="mt-3 text-sm text-black/45 dark:text-white/45">
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
  const caveat = hideCaveat
    ? undefined
    : option.checks.find((c) => c.status === 'unknown' || c.status === 'warn')

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <a
          href={option.url}
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-black/20 underline-offset-4 hover:decoration-black/60 dark:decoration-white/25"
        >
          {option.brand} {option.model}
        </a>
        <div className="mt-0.5 text-sm text-black/55 dark:text-white/55">
          {option.ratedWatts}W
          {option.efficiencyRating && <> · {option.efficiencyRating}</>} · {option.shop}
        </div>
        {caveat && (
          <div className="mt-1 text-sm text-amber-700 dark:text-amber-500">{caveat.message}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {option.cheapestFit && <Badge>Cheapest fit</Badge>}
        {verified && <Badge>Connector verified</Badge>}
        <span className="tabular-nums">{rs(option.cheapestLkr)}</span>
      </div>
    </li>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-black/15 px-2 py-0.5 text-xs font-medium dark:border-white/25">
      {children}
    </span>
  )
}

function connectorLabel(c: string) {
  switch (c) {
    case '8pin':
      return '1× 8-pin power'
    case '2x8pin':
      return '2× 8-pin power'
    case '12vhpwr':
      return '12VHPWR power'
    case '12v-2x6':
      return '12V-2x6 (16-pin) power'
    default:
      return c
  }
}
