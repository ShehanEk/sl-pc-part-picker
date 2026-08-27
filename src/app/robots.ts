import type { MetadataRoute } from 'next'

import { canonical } from '@/lib/site'

/**
 * Every part of the catalogue is crawlable. The main job of this file is to
 * point at the sitemap, which is how ~1,100 part pages get discovered in
 * reasonable time rather than one link hop at a time.
 *
 * `/admin` and `/api` are disallowed to keep them out of search results, not to
 * protect them — a robots file is a request, and listing a path here arguably
 * advertises it. What actually protects those routes is the signed session
 * cookie checked inside every admin page and Server Action, and the bearer
 * token on the revalidate handler. The `noindex` on the admin layout is what
 * keeps them out of an index if a crawler ignores this.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
    sitemap: canonical('/sitemap.xml'),
    host: canonical('/').replace(/\/$/, ''),
  }
}
