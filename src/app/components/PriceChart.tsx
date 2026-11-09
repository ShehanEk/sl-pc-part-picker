'use client'

import { useState, type KeyboardEvent, type PointerEvent } from 'react'

import { rupees } from '@/lib/site'
import type { PricePoint } from '@/queries/seo'

const W = 600
const H = 140
const PAD = 12

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "2026-11-04" → "Tue 4 Nov 2026". Spelled out by hand: browsers disagree on
 * short month names ("Sep" or "Sept"). UTC, so the day never shifts by time zone.
 */
const longDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * The lowest in-stock price per day. The SVG renders on the server as before;
 * hovering, tapping, dragging or the arrow keys show one day's date and price.
 */
export function PriceChart({ points }: { points: PricePoint[] }) {
  const [active, setActive] = useState<number | null>(null)

  const values = points.map((p) => p.lowestLkr)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const last = points.length - 1
  const x = (i: number) => (i / last) * 100
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2)
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / last) * W).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')
  const first = points[0]
  const end = points[last]

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    setActive(Math.round(ratio * last))
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? last
    const next =
      e.key === 'ArrowLeft' ? from - 1
      : e.key === 'ArrowRight' ? from + 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (e.key === 'Escape') setActive(null)
    if (next === null) return
    e.preventDefault()
    setActive(Math.min(last, Math.max(0, next)))
  }

  const point = active === null ? null : points[active]
  const left = active === null ? 0 : x(active)
  // Centred on the point, but pinned inside the chart near either edge.
  const shift = left < 18 ? '0%' : left > 82 ? '-100%' : '-50%'

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div
        tabIndex={0}
        aria-label="Price history. Use the left and right arrow keys to read each day's price."
        className="relative h-[140px] touch-pan-y cursor-crosshair rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        onFocus={() => setActive((a) => a ?? last)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[140px] w-full"
          role="img"
          aria-label={`Lowest in-stock price from ${first.day} to ${end.day}: ${rupees(first.lowestLkr)} to ${rupees(end.lowestLkr)}, ranging ${rupees(min)} to ${rupees(max)}.`}
        >
          <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="var(--accent-soft)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {point && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-ink-3"
              style={{ left: `${left}%` }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--accent)] shadow-[0_1px_4px_rgb(35_55_110/40%)]"
              style={{ left: `${left}%`, top: `${y(point.lowestLkr)}px` }}
            />
            <span
              className="pointer-events-none absolute top-0 flex flex-col gap-0.5 whitespace-nowrap rounded-[10px] bg-ink px-3 py-2 text-white shadow-[0_8px_20px_-8px_rgb(20_30_60/50%)]"
              style={{ left: `${left}%`, transform: `translateX(${shift})` }}
            >
              <span className="text-[12px] text-white/75">{longDay(point.day)}</span>
              <span className="mono text-[15px] font-medium">{rupees(point.lowestLkr)}</span>
            </span>
          </>
        )}
        <span role="status" className="sr-only">
          {point ? `${longDay(point.day)}: ${rupees(point.lowestLkr)}` : ''}
        </span>
      </div>
      <figcaption className="mono flex justify-between gap-2 text-[12px] text-ink-3">
        <span>
          {first.day.slice(5)} · {rupees(first.lowestLkr)}
        </span>
        <span className="font-medium text-ink">
          {end.day.slice(5)} · {rupees(end.lowestLkr)}
        </span>
      </figcaption>
    </figure>
  )
}
