import { OG_SIZE, CategoryTile, ogImage } from '@/lib/og'
import { CATEGORIES, TRACKED_SHOPS } from '@/lib/site'

/** The share image for the home page, and for any page without its own. */

export const alt = 'PCPrice.lk: find the cheapest place to buy any PC part in Sri Lanka'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return ogImage({
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 72,
            fontWeight: 600,
            lineHeight: 1.02,
            letterSpacing: '-0.04em',
          }}
        >
          <span>Find the cheapest place</span>
          <span>to buy any PC part</span>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          {CATEGORIES.map((slot) => (
            <CategoryTile key={slot} slot={slot} size={96} />
          ))}
        </div>
      </div>
    ),
    footer: <span>{`${TRACKED_SHOPS.length} Sri Lankan shops compared side by side`}</span>,
  })
}
