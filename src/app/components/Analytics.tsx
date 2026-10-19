import Script from 'next/script'

/**
 * Google Analytics 4. Loads only when NEXT_PUBLIC_GA_ID is set, which is only
 * in Vercel's Production environment, so local runs and preview deployments
 * are never counted.
 *
 * Page views on client-side navigation and clicks out to shops come from GA's
 * enhanced measurement (on in the property settings), not from code here.
 */

// A malformed ID is ignored rather than interpolated into the inline script.
const GA_ID = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_ID ?? '')
  ? process.env.NEXT_PUBLIC_GA_ID
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
