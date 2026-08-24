'use client'

import { useMemo, useState } from 'react'

import { CartoonPC } from './CartoonPC'

import {
  BUILD_SLOTS,
  SLOT_LABEL,
  evaluateBuild,
  rankCandidates,
  suggestNextSlot,
  type Build,
  type BuildSlot,
} from '@/compat/build'
import type { CheckStatus } from '@/compat/rules'
import type { PartOffer } from '@/queries/build'

/**
 * The configurator.
 *
 * The build lives in component state rather than the address bar: choosing a
 * part is then instant, with no navigation between clicks, which matters when
 * the whole interaction is a sequence of small choices. The whole catalogue is
 * shipped once and every list is filtered locally — the compatibility rules are
 * pure functions, so they run just as well here as on the server.
 */

const rs = (n: number) => `Rs ${n.toLocaleString('en-LK')}`

/**
 * Written out in full rather than derived: these class names have to appear
 * literally in the source for Tailwind to generate them.
 */
const TONE: Record<CheckStatus, { text: string; dot: string }> = {
  pass: { text: 'text-green', dot: 'bg-green' },
  fail: { text: 'text-red', dot: 'bg-red' },
  warn: { text: 'text-orange', dot: 'bg-orange' },
  unknown: { text: 'text-orange', dot: 'bg-orange' },
}

export type Catalogue = Record<BuildSlot, PartOffer[]>

export function Configurator({ catalogue }: { catalogue: Catalogue }) {
  const [build, setBuild] = useState<Build>({})
  const [openedSlot, setOpenedSlot] = useState<BuildSlot | null>(null)
  const [expandedShops, setExpandedShops] = useState<string | null>(null)

  const report = useMemo(() => evaluateBuild(build), [build])
  const suggestion = useMemo(() => suggestNextSlot(build), [build])
  const activeSlot = openedSlot ?? suggestion?.slot ?? null

  const options = useMemo(
    () => (activeSlot ? rankCandidates(build, activeSlot, catalogue[activeSlot]) : []),
    [build, activeSlot, catalogue],
  )

  const fitting = options.filter((o) => o.status !== 'fail')
  const blocked = options.filter((o) => o.status === 'fail')

  const choose = (slot: BuildSlot, part: PartOffer, shop?: string, price?: number) => {
    setBuild((b) => ({
      ...b,
      [slot]: shop ? { ...part, shop, priceLkr: price ?? part.priceLkr } : part,
    }))
    setExpandedShops(null)
    setOpenedSlot(null)
  }

  const clear = (slot: BuildSlot) => {
    setBuild((b) => {
      const next = { ...b }
      delete next[slot]
      return next
    })
    setExpandedShops(null)
  }

  // Parts implicated in a hard conflict, so the drawing can refuse to seat them.
  const failing = report.checks.filter((c) => c.status === 'fail').map((c) => c.id)
  const conflicted = BUILD_SLOTS.filter((s) => {
    if (!build[s]) return false
    if (failing.includes('cpu-socket') && (s === 'cpu' || s === 'motherboard')) return true
    if (failing.some((f) => f.startsWith('ram-')) && (s === 'ram' || s === 'motherboard')) return true
    if (failing.includes('psu-wattage') && s === 'psu') return true
    if (failing.includes('gpu-connector') && (s === 'gpu' || s === 'psu')) return true
    if (failing.includes('case-fit') && (s === 'case' || s === 'motherboard')) return true
    return false
  })

  const shops = new Set(report.filled.map((s) => build[s]!.shop).filter(Boolean))

  const shown = fitting.slice(0, 25)
  const caveatOf = (o: (typeof shown)[number]) =>
    o.checks.find((c) => c.status === 'unknown' || c.status === 'warn')?.message
  const firstCaveat = shown.length ? caveatOf(shown[0]) : undefined
  // When every option carries the same reservation, say it once above the list
  // rather than down every row — on a phone that repetition cost a whole screen.
  const sharedCaveat =
    shown.length > 1 && firstCaveat && shown.every((o) => caveatOf(o) === firstCaveat)
      ? firstCaveat
      : null

  return (
    <>
      <section className="mb-8">
        <div className="mb-2 flex justify-center px-1">
          <CartoonPC
            filled={report.filled}
            conflicted={conflicted}
            complete={report.empty.length === 0 && report.status !== 'fail'}
          />
        </div>

        <h2 className="ios-section-header uppercase">Your build</h2>
        <ul className="ios-list">
          {BUILD_SLOTS.map((slot) => {
            const part = build[slot]
            return (
              <li key={slot}>
                <button
                  type="button"
                  onClick={() => setOpenedSlot(slot === activeSlot ? null : slot)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-fill ${
                    slot === activeSlot ? 'bg-fill' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[0.8125rem] capitalize text-label-secondary">
                      {SLOT_LABEL[slot]}
                    </span>
                    <span
                      className={`block truncate text-[1.0625rem] ${part ? '' : 'text-label-tertiary'}`}
                    >
                      {part ? part.model : `Choose — ${catalogue[slot].length} in stock`}
                    </span>
                    {part?.shop && (
                      <span className="block text-[0.8125rem] text-label-secondary">{part.shop}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {part?.priceLkr != null && (
                      <span className="text-[1.0625rem] tabular-nums">{rs(part.priceLkr)}</span>
                    )}
                    <Chevron />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {report.filled.length > 0 && (
          <div className="mt-2.5 rounded-[var(--radius)] bg-surface px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[1.0625rem] font-semibold">Total so far</span>
              <span className="text-[1.375rem] font-semibold tabular-nums">{rs(report.totalLkr)}</span>
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

      {activeSlot && (
        <section>
          <h2 className="ios-section-header uppercase">Choose a {SLOT_LABEL[activeSlot]}</h2>

          <div className="mb-2.5 rounded-[var(--radius)] bg-surface px-4 py-3">
            <p className="text-[0.9375rem] leading-snug">
              {suggestion?.slot === activeSlot && !build[activeSlot]
                ? suggestion.message
                : `${fitting.length} of ${options.length} in stock will work.`}
            </p>
            {blocked.length > 0 && (
              <p className="mt-1 text-[0.8125rem] text-label-secondary">
                {blocked.length} hidden because they don&apos;t fit — {blocked[0].blockedBy}
              </p>
            )}
            {sharedCaveat && (
              <p className="mt-2 flex gap-2 text-[0.8125rem] leading-snug text-orange">
                <Dot className="mt-[0.4rem] shrink-0 bg-orange" />
                <span>{sharedCaveat}</span>
              </p>
            )}
            {build[activeSlot] && (
              <button
                type="button"
                onClick={() => clear(activeSlot)}
                className="-mx-1 mt-1 px-1 py-2 text-[0.9375rem] text-blue"
              >
                Remove {build[activeSlot]!.model}
              </button>
            )}
          </div>

          {fitting.length === 0 ? (
            <div className="rounded-[var(--radius)] bg-surface px-4 py-5 text-[0.9375rem] text-label-secondary">
              Nothing in stock fits the parts you&apos;ve chosen. Try changing another slot.
            </div>
          ) : (
            <ul className="ios-list">
              {shown.map((o) => {
                const part = o.part
                const selected = build[activeSlot]?.partId === part.partId
                const caveat = sharedCaveat ? undefined : caveatOf(o)
                const specs = [
                  part.socket,
                  part.ramType,
                  part.capacityGb ? `${part.capacityGb}GB` : null,
                  part.speedMhz ? `${part.speedMhz}MHz` : null,
                  part.vramGb ? `${part.vramGb}GB` : null,
                  part.tdpWatts ? `${part.tdpWatts}W` : null,
                  part.ratedWatts ? `${part.ratedWatts}W` : null,
                  part.storageInterface,
                  part.category === 'case' ? part.formFactor : null,
                ]
                  .filter(Boolean)
                  .slice(0, 3)

                return (
                  <li key={part.partId}>
                    <button
                      type="button"
                      onClick={() => choose(activeSlot, part)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-fill"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[1.0625rem]">
                          {selected && <span className="mr-1.5 text-blue">✓</span>}
                          {part.model}
                        </span>
                        <span className="block text-[0.8125rem] text-label-secondary">
                          {[part.brand, ...specs].filter(Boolean).join(' · ')}
                        </span>
                        <span className="block text-[0.8125rem] text-label-secondary">
                          {selected ? (build[activeSlot]!.shop ?? part.shop) : part.shop}
                        </span>
                        {caveat && (
                          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-label-tertiary">
                            {caveat}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 pt-0.5">
                        <span className="text-[1.0625rem] tabular-nums">{rs(part.priceLkr ?? 0)}</span>
                        <Chevron />
                      </span>
                    </button>

                    {part.offers.length > 1 && (
                      <div className="px-4 pb-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedShops((e) => (e === part.partId ? null : part.partId))
                          }
                          className="-mx-2 px-2 py-3 text-[0.8125rem] text-blue"
                        >
                          {expandedShops === part.partId
                            ? 'Hide'
                            : `Compare ${part.offers.length} shops`}
                        </button>
                        {expandedShops === part.partId && (
                          <ul className="mt-1.5 space-y-1">
                            {part.offers.map((offer) => (
                              <li key={offer.shop}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    choose(activeSlot, part, offer.shop, offer.priceLkr)
                                  }
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-[0.8125rem] ${
                                    offer.inStock ? '' : 'opacity-55'
                                  } ${
                                    selected && build[activeSlot]!.shop === offer.shop ? 'bg-fill' : ''
                                  }`}
                                >
                                  <span>
                                    {offer.shop}
                                    {!offer.inStock && (
                                      <span className="ml-1.5 text-label-tertiary">· out of stock</span>
                                    )}
                                  </span>
                                  <span className="tabular-nums">{rs(offer.priceLkr)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {fitting.length > 25 && (
            <p className="ios-section-header pt-2">and {fitting.length - 25} more that fit.</p>
          )}
        </section>
      )}

      {report.filled.length > 0 && (
        <section className="mt-8">
          <h2 className="ios-section-header uppercase">What we don&apos;t check</h2>
          <div className="rounded-[var(--radius)] bg-surface px-4 py-3.5 text-[0.8125rem] leading-relaxed text-label-secondary">
            We check sockets, memory type, power, and that the board fits the case. We don&apos;t
            check whether the graphics card or cooler physically clear it — card length and
            cooler height aren&apos;t published in local listings, so we&apos;d be guessing.
          </div>
        </section>
      )}
    </>
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
