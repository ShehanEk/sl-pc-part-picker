import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Keeps anonymous traffic off `/admin` — and therefore off the database.
 *
 * This is an **optimisation, not the authorization boundary**. It only checks
 * that a session cookie is present; it does not verify the signature, because
 * proxy code is meant to be cheap and may run at the edge away from the app's
 * secrets. The real checks are `requireAdmin()` in the dashboard layout and
 * `assertAdmin()` at the top of every Server Action. Next's own proxy docs say
 * it "should not be used as a full session management or authorization
 * solution", and a Server Action is a public POST endpoint regardless of what
 * happens here.
 *
 * `middleware.ts` is deprecated in Next 16; this file convention replaced it.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The login page has to stay reachable, or this redirects to itself forever.
  if (pathname === '/admin/login') return NextResponse.next()

  if (!request.cookies.has('pcmaker_admin')) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/admin/:path*',
}
