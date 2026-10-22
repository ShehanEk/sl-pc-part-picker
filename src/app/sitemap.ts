import type { MetadataRoute } from 'next'

import { CATEGORIES, canonical } from '@/lib/site'
import { listIndexableParts, loadDirectory } from '@/queries/seo'

/**
 * Every indexable URL: the home page, the PC builder, eight category pages,
 * and one page per part.
 *
 * `lastModified` is the day that part's price was last confirmed rather than the
 * build time. A sitemap that claims a thousand pages changed the moment we
 * deployed is telling a crawler nothing it can act on; a real date lets it come
 * back to the pages that actually moved.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [directory, parts] = await Promise.all([loadDirectory(), listIndexableParts()])

  const newestIn = (slot: (typeof CATEGORIES)[number]) =>
    directory[slot].map((p) => p.updatedOn).sort().at(-1)

  return [
    {
      url: canonical('/'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: canonical('/deals'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: canonical('/build'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    ...CATEGORIES.map((slot) => ({
      url: canonical(`/${slot}`),
      lastModified: new Date(newestIn(slot) ?? Date.now()),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...parts.map((p) => ({
      url: canonical(`/${p.category}/${p.partId}`),
      lastModified: new Date(p.updatedOn),
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ]
}
