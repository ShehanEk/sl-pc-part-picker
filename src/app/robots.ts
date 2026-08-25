import type { MetadataRoute } from 'next'

import { canonical } from '@/lib/site'

/**
 * Nothing here is private, so everything is crawlable. The one job this file
 * really does is point at the sitemap, which is how ~1,000 part pages get
 * discovered in reasonable time rather than one link hop at a time.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: canonical('/sitemap.xml'),
    host: canonical('/').replace(/\/$/, ''),
  }
}
