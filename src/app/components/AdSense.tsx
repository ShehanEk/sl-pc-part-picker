import Script from 'next/script'

/**
 * Google AdSense, Auto ads, on the production deployment only (see
 * Analytics.tsx for why VERCEL_ENV decides).
 *
 * Rendered by the part page and the PC builder, not the layout, so those are
 * the only pages that load it and the only pages ads can appear on. Where on
 * the page they go is Auto ads' choice, set in AdSense. `public/ads.txt`
 * pairs with the publisher ID.
 */
const IS_PRODUCTION = process.env.VERCEL_ENV === 'production'

const ADSENSE_PUBLISHER = process.env.NEXT_PUBLIC_ADSENSE_ID || 'ca-pub-5779314604498621'

// A malformed ID is ignored rather than interpolated into the script URL.
const ADSENSE_ID = IS_PRODUCTION && /^ca-pub-\d+$/.test(ADSENSE_PUBLISHER) ? ADSENSE_PUBLISHER : null

export function AdSense() {
  if (!ADSENSE_ID) return null
  return (
    <Script
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  )
}
