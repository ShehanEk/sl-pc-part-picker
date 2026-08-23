import type { PricePoint } from '@/queries/parts'

/**
 * 30-day lowest-price trend.
 *
 * Scraping started recently, so most parts have one or two points. Drawing a
 * flat line from a single reading would imply a stable price we have not
 * observed, so anything under three points says so instead.
 */
export function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 3) {
    return (
      <p className="text-[0.8125rem] leading-snug text-label-tertiary">
        Price history builds as we check each day —{' '}
        {points.length === 1 ? 'one day' : `${points.length} days`} recorded so far.
      </p>
    )
  }

  const w = 320
  const h = 44
  const values = points.map((p) => p.lowestLkr)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - 2) + 1
    const y = h - 3 - ((p.lowestLkr - min) / span) * (h - 10)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const first = values[0]
  const last = values[values.length - 1]
  const delta = last - first
  const pct = Math.abs((delta / first) * 100).toFixed(1)
  // Falling prices are the good news for a buyer, so they take the positive colour.
  const tone = delta === 0 ? 'text-label-secondary' : delta < 0 ? 'text-green' : 'text-red'

  return (
    <div>
      <p className="text-[0.8125rem] text-label-secondary">Lowest price, {points.length} days</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className={`mt-1.5 w-full max-w-[20rem] ${tone}`}
        role="img"
        aria-label={`Lowest price over ${points.length} days, from Rs ${first.toLocaleString('en-LK')} to Rs ${last.toLocaleString('en-LK')}`}
      >
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p className={`mt-1 text-[0.8125rem] font-medium ${tone}`}>
        {delta === 0 ? 'Unchanged' : `${delta < 0 ? '↓' : '↑'} ${pct}%`}
      </p>
    </div>
  )
}
