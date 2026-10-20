import Script from 'next/script'

/**
 * Google Analytics 4, on the production deployment only: VERCEL_ENV is
 * "production" there and unset locally or "preview" on preview deployments,
 * so neither is ever counted.
 *
 * The Measurement ID is public (it is in every page's HTML), so it lives here
 * rather than in a setting. NEXT_PUBLIC_GA_ID overrides it if ever needed.
 *
 * Page views on client-side navigation and clicks out to shops come from GA's
 * enhanced measurement (on in the property settings), not from code here.
 */
const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-GXGFL8QEKV'

// A malformed ID is ignored rather than interpolated into the inline script.
const GA_ID =
  process.env.VERCEL_ENV === 'production' && /^G-[A-Z0-9]+$/.test(MEASUREMENT_ID)
    ? MEASUREMENT_ID
    : null

export function Analytics() {
  if (!GA_ID) return null
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  )
}
