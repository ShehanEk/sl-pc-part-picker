import Script from 'next/script'

/**
 * Google Analytics 4, Microsoft Clarity and AdSense, on the production deployment only:
 * VERCEL_ENV is "production" there and unset locally or "preview" on preview
 * deployments, so neither is ever counted or recorded.
 *
 * Both IDs are public (they are in every page's HTML), so they live here rather
 * than in a setting. NEXT_PUBLIC_GA_ID and NEXT_PUBLIC_CLARITY_ID override them
 * if ever needed.
 *
 * Page views on client-side navigation and clicks out to shops come from GA's
 * enhanced measurement (on in the property settings), not from code here.
 * Clarity records sessions and heatmaps; its masking setting hides what people
 * type.
 */
const IS_PRODUCTION = process.env.VERCEL_ENV === 'production'

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-GXGFL8QEKV'
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_ID || 'z5ys6q8vkp'
/** AdSense publisher. Auto ads, so where they show is set in AdSense, not here. Pairs with public/ads.txt. */
const ADSENSE_PUBLISHER = process.env.NEXT_PUBLIC_ADSENSE_ID || 'ca-pub-5779314604498621'

// A malformed ID is ignored rather than interpolated into the inline script.
const GA_ID = IS_PRODUCTION && /^G-[A-Z0-9]+$/.test(MEASUREMENT_ID) ? MEASUREMENT_ID : null
const CLARITY_ID = IS_PRODUCTION && /^[a-z0-9]+$/.test(CLARITY_PROJECT_ID) ? CLARITY_PROJECT_ID : null
const ADSENSE_ID = IS_PRODUCTION && /^ca-pub-\d+$/.test(ADSENSE_PUBLISHER) ? ADSENSE_PUBLISHER : null

export function Analytics() {
  return (
    <>
      {GA_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      ) : null}
      {CLARITY_ID ? (
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${CLARITY_ID}");`}
        </Script>
      ) : null}
      {ADSENSE_ID ? (
        <Script
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      ) : null}
    </>
  )
}
