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
      <p className="text-sm text-black/45 dark:text-white/45">
        Price history starts building from{' '}
        {points.length ? new Date(points[0].day).toLocaleDateString('en-LK') : 'the first scrape'} —
        {points.length === 1 ? ' one day' : ` ${points.length} days`} recorded so far.
      </p>
    )
  }

  const w = 320
  const h = 56
  const values = points.map((p) => p.lowestLkr)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - 2) + 1
    const y = h - 4 - ((p.lowestLkr - min) / span) * (h - 12)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const first = values[0]
  const last = values[values.length - 1]
  const delta = last - first
  const pct = ((delta / first) * 100).toFixed(1)

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full max-w-[320px]"
        role="img"
        aria-label={`Lowest price over ${points.length} days, from Rs ${first.toLocaleString('en-LK')} to Rs ${last.toLocaleString('en-LK')}`}
      >
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-black/70 dark:text-white/70"
        />
      </svg>
      <p className="text-sm text-black/55 dark:text-white/55">
        {delta === 0
          ? `Steady over ${points.length} days`
          : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(Number(pct))}% over ${points.length} days`}
      </p>
    </div>
  )
}
