'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { BuildSlot } from '@/compat/build'

import { CATEGORY_STYLE } from './PartIcons'

/** A deal reduced to what the list shows, so pages don't ship whole parts. */
export type DealItem = {
  slot: BuildSlot
  heading: string
  partId: string
  name: string
  priceLkr: number
  shop: string
  usualLkr: number
  savingLkr: number
  percent: number
  lowest: boolean
}

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-LK')}`

function Tile({ slot, size }: { slot: BuildSlot; size: number }) {
  const { Icon, tint, ink } = CATEGORY_STYLE[slot]
  return (
    <span
      className="grid flex-none place-items-center"
      style={{ width: size, height: size, borderRadius: size / 4, background: tint, color: ink }}
    >
      <Icon width={size * 0.58} height={size * 0.58} />
    </span>
  )
}

function Saving({ deal }: { deal: DealItem }) {
  return (
    <span className="mono inline-flex items-center whitespace-nowrap rounded-full bg-[#e2f5eb] px-2.5 py-1 text-[12.5px] font-medium text-[#0f7a4f]">
      −{deal.percent}% · {rs(deal.savingLkr)} less
    </span>
  )
}

function Row({ deal }: { deal: DealItem }) {
  const { strong } = CATEGORY_STYLE[deal.slot]
  return (
    <li className="hairline-b last:border-b-0">
      <Link
        href={`/${deal.slot}/${deal.partId}`}
        className="row-tap flex flex-wrap items-center gap-x-[18px] gap-y-2.5 px-5 py-4"
      >
        <Tile slot={deal.slot} size={44} />
        <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: strong }}>
            {deal.heading}
          </span>
          <span className="text-[15.5px] font-semibold tracking-[-0.01em]">{deal.name}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Saving deal={deal} />
            {deal.lowest && (
              <span className="rounded-full bg-[#e5efff] px-2.5 py-1 text-[12px] font-semibold text-accent">
                Lowest in 30 days
              </span>
            )}
          </span>
        </span>
        <span className="ml-auto flex flex-col items-end gap-0.5 text-right">
          <span className="mono whitespace-nowrap text-[18px] font-medium tracking-[-0.02em] text-accent">
            {rs(deal.priceLkr)}
          </span>
          <span className="text-[12.5px] text-ink-2">
            at <span className="mono text-ink">{deal.shop}</span>
          </span>
          <span className="text-[12px] text-ink-3">
            usually <span className="line-through">{rs(deal.usualLkr)}</span>
          </span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="flex-none text-ink-4" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    </li>
  )
}

/** The /deals list, with a chip per category that has deals. */
export function DealsList({ deals, labels }: { deals: DealItem[]; labels: Record<string, string> }) {
  const [slot, setSlot] = useState<BuildSlot | null>(null)
  const counts = new Map<BuildSlot, number>()
  for (const d of deals) counts.set(d.slot, (counts.get(d.slot) ?? 0) + 1)
  const shown = slot ? deals.filter((d) => d.slot === slot) : deals

  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13.5px] transition ${
      on
        ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-white'
        : 'border-[rgb(30_50_100/12%)] bg-white font-medium text-ink-2 hover:border-[var(--accent-soft-border)]'
    }`

  return (
    <div className="flex flex-col gap-5">
      {counts.size > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter deals by category">
          <button type="button" aria-pressed={slot === null} onClick={() => setSlot(null)} className={chip(slot === null)}>
            All {deals.length}
          </button>
          {[...counts].map(([s, n]) => (
            <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)} className={chip(slot === s)}>
              {labels[s]} {n}
            </button>
          ))}
        </div>
      )}

      <section aria-labelledby="deals-count" className="glass overflow-hidden">
        <div className="hairline-b flex items-center justify-between gap-2.5 px-5 py-3.5">
          <h2 id="deals-count" className="m-0 text-[14px] font-semibold" aria-live="polite">
            {shown.length} {shown.length === 1 ? 'deal' : 'deals'} today
          </h2>
          <span className="text-[13px] text-ink-3">Biggest saving first</span>
        </div>
        <ul>
          {shown.map((d) => (
            <Row key={d.partId} deal={d} />
          ))}
        </ul>
        <p className="m-0 bg-[rgb(240_243_250/60%)] px-5 py-3.5 text-[12.5px] text-ink-3">
          &ldquo;Usually&rdquo; is the median of the lowest in-stock price on each of the last 30 days we
          checked. Prices change between our checks; confirm with the shop before you buy.
        </p>
      </section>
    </div>
  )
}

/** A home-page card for one deal. */
export function DealCard({ deal }: { deal: DealItem }) {
  const { strong } = CATEGORY_STYLE[deal.slot]
  return (
    <Link
      href={`/${deal.slot}/${deal.partId}`}
      className="flex w-[240px] flex-none snap-start flex-col gap-2.5 rounded-[18px] border border-[rgb(30_50_100/9%)] bg-white/90 p-4 transition hover:-translate-y-0.5 sm:w-auto sm:flex-1"
    >
      <span className="flex items-center gap-2.5">
        <Tile slot={deal.slot} size={36} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: strong }}>
          {deal.heading}
        </span>
      </span>
      <span className="text-[14.5px] font-semibold leading-snug">{deal.name}</span>
      <span className="flex flex-col gap-0.5">
        <span className="mono text-[17px] font-medium text-accent">{rs(deal.priceLkr)}</span>
        <span className="text-[12px] text-ink-2">
          at {deal.shop} · usually <span className="line-through">{rs(deal.usualLkr)}</span>
        </span>
      </span>
      <span>
        <Saving deal={deal} />
      </span>
    </Link>
  )
}
