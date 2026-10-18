import type { MetadataRoute } from 'next'

import { canonical } from '@/lib/site'

/**
 * Every part of the catalogue is crawlable. The main job of this file is to
 * point at the sitemap, which is how ~1,100 part pages get discovered in
 * reasonable time rather than one link hop at a time.
 *
 * `/api` is disallowed to keep it out of search results, not to protect it — a
 * robots file is a request. What actually protects the revalidate handler is
 * its bearer token.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api'] },
    sitemap: canonical('/sitemap.xml'),
    host: canonical('/').replace(/\/$/, ''),
  }
}
