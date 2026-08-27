import type { Metadata } from 'next'

/**
 * Wraps both the login page and the gated dashboard, so it holds only what both
 * need: keeping these pages out of search results.
 *
 * The gate itself lives one level down in `(dashboard)/layout.tsx`. Putting it
 * here would lock the login page too, and the redirect would loop.
 */
export const metadata: Metadata = {
  // Overrides the site-wide `index: true` in the root layout.
  robots: { index: false, follow: false },
  title: 'Admin',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
