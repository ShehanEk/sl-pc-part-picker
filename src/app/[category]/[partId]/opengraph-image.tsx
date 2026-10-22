import { BLUE, CategoryChip, INK, LABEL, MONO, MUTED, OG_SIZE, ogImage } from '@/lib/og'
import { type Category, CATEGORY_COPY, rupees } from '@/lib/site'
import { displayName } from '@/lib/specs'
import { loadDirectory } from '@/queries/seo'

/**
 * The share image for a part page: the cheapest shop and its price.
 *
 * Drawn on first request rather than at build. There are 1,350 parts and only
 * the shared ones are ever fetched, so prerendering them all would add minutes
 * to every deploy for images nobody asks for.
 */

export const revalidate = 1800
export const alt = 'The cheapest price in Sri Lanka, compared across local shops'
export const size = OG_SIZE
export const contentType = 'image/png'

export function generateStaticParams() {
  return []
}

export default async function Image({
  params,
}: {
  params: Promise<{ category: string; partId: string }>
}) {
  const { category, partId } = await params
  const slot = category as Category
  const part = (await loadDirectory())[slot]?.find((p) => p.partId === partId)
  if (!part) return new Response('Not found', { status: 404 })

  const name = displayName(part)
  // Offers are sorted buyable-first then cheapest, as on the page.
  const buyable = part.offers.filter((o) => o.inStock && !o.stale)
  const best = buyable[0] ?? null
  const dearest = buyable.length > 1 ? Math.max(...buyable.map((o) => o.priceLkr)) : null

  return ogImage({
    chip: <CategoryChip slot={slot} label={CATEGORY_COPY[slot].heading} />,
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            display: 'block',
            fontSize: name.length > 30 ? 56 : 68,
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: '-0.04em',
            lineClamp: 2,
          }}
        >
          {name}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL }}
            >
              {best ? 'Cheapest in stock' : 'Out of stock now'}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 88,
                lineHeight: 1,
                letterSpacing: '-0.04em',
                color: best ? BLUE : MUTED,
              }}
            >
              {rupees(best ? best.priceLkr : part.lowLkr)}
            </span>
          </div>
          <div style={{ display: 'flex', paddingBottom: 10, fontSize: 30, color: MUTED }}>
            {best ? (
              <>
                at&nbsp;<span style={{ fontFamily: MONO, color: INK }}>{best.shop}</span>
              </>
            ) : (
              'last seen price'
            )}
          </div>
        </div>
      </div>
    ),
    footer: (
      <span>
        {`${part.offers.length} ${part.offers.length === 1 ? 'shop' : 'shops'} compared${
          best && dearest !== null && dearest > best.priceLkr
            ? ` · up to ${rupees(dearest)} elsewhere`
            : ''
        }`}
      </span>
    ),
  })
}
