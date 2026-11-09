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
 *
 * `/search` is disallowed to save cost: it renders on every request over the
 * whole catalogue, and its pages are noindex anyway, so a crawler following
 * search links bought nothing but function time.
 *
 * Googlebot also skips `opengraph-image` routes. Search Console showed ~1,100
 * of them crawled and not indexed while ~1,100 real part pages waited in
 * "Discovered - currently not indexed": they were spending crawl budget the
 * part pages need. The rule is Googlebot-only so link previews on Facebook,
 * WhatsApp and X keep working. A named group replaces `*` for that bot, so it
 * repeats the shared disallows.
 */
const DISALLOW = ['/api', '/search']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: 'Googlebot', allow: '/', disallow: [...DISALLOW, '/*/opengraph-image'] },
      { userAgent: '*', allow: '/', disallow: DISALLOW },
    ],
    sitemap: canonical('/sitemap.xml'),
    host: canonical('/').replace(/\/$/, ''),
  }
}
