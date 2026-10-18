import { BUILD_SLOTS, type BuildSlot } from '@/compat/build'
import { LABEL, MONO, OG_SIZE, BLUE, CategoryTile, ogImage } from '@/lib/og'
import { CATEGORY_COPY, TRACKED_SHOPS, rupees } from '@/lib/site'
import { loadDirectory } from '@/queries/seo'

/** The share image for a category page: how many are in stock, and from what. */

export const revalidate = 1800
export const dynamicParams = false
export const alt = 'Prices in Sri Lanka, compared across local shops'
export const size = OG_SIZE
export const contentType = 'image/png'

export function generateStaticParams() {
  return BUILD_SLOTS.map((category) => ({ category }))
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '22px 28px',
        borderRadius: 22,
        background: 'rgba(255,255,255,0.85)',
        border: '2px solid rgba(30,50,100,0.08)',
      }}
    >
      <span
        style={{ fontSize: 18, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL }}
      >
        {label}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 46, letterSpacing: '-0.03em', color }}>{value}</span>
    </div>
  )
}

export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const slot = (await params).category as BuildSlot
  const copy = CATEGORY_COPY[slot]
  const inStock = (await loadDirectory())[slot].filter((p) => p.bestLkr !== null)
  const cheapest = inStock.length ? Math.min(...inStock.map((p) => p.bestLkr!)) : null

  return ogImage({
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <CategoryTile slot={slot} size={112} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 66,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: '-0.04em',
            }}
          >
            <span>{copy.heading} prices</span>
            <span>in Sri Lanka</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <Stat label="In stock now" value={String(inStock.length)} />
          {cheapest !== null ? <Stat label="From" value={rupees(cheapest)} color={BLUE} /> : null}
          <Stat label="Compared" value={`${TRACKED_SHOPS.length} shops`} />
        </div>
      </div>
    ),
    footer: <span>{`The cheapest shop for every ${copy.singular}, side by side`}</span>,
  })
}
