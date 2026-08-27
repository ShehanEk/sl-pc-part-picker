import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Admin session: one password, one signed cookie.
 *
 * Proportional to the problem — a single operator, one machine, no user table.
 * There is no account system to build because there are no accounts.
 *
 * The cookie is `expiry.hmac(expiry)`, signed with a server-side secret, so it
 * cannot be forged or extended by the holder. It carries no identity because
 * there is only one identity.
 *
 * **`requireAdmin()` must be called inside every Server Action, not only in the
 * layout.** A Server Action compiles to a POST endpoint on the page that
 * declares it, reachable by anyone who can send the request; the Next docs are
 * explicit that "render-time gating (only rendering a form on an authenticated
 * page) is not a security boundary". The layout check stops people seeing the
 * dashboard. Only the check inside the action stops them using it.
 */

const COOKIE = 'pcmaker_admin'
const SESSION_MS = 12 * 60 * 60 * 1000

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET
  if (!value) throw new Error('ADMIN_SESSION_SECRET is not set')
  return value
}

function sign(expiry: number): string {
  return createHmac('sha256', secret()).update(String(expiry)).digest('hex')
}

/** Constant-time compare that tolerates length differences without throwing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function isConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET)
}

export type SignInResult = { ok: true } | { ok: false; error: string }

export async function signIn(password: string): Promise<SignInResult> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected || !process.env.ADMIN_SESSION_SECRET) {
    return { ok: false, error: 'Admin is not configured on this deployment.' }
  }
  if (!safeEqual(password, expected)) {
    return { ok: false, error: 'Wrong password.' }
  }

  const expiry = Date.now() + SESSION_MS
  const store = await cookies()
  store.set(COOKIE, `${expiry}.${sign(expiry)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MS / 1000),
  })
  return { ok: true }
}

export async function signOut(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}

function verify(value: string | undefined): boolean {
  if (!value) return false
  const [rawExpiry, mac] = value.split('.')
  const expiry = Number(rawExpiry)
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false
  return safeEqual(mac ?? '', sign(expiry))
}

export async function isSignedIn(): Promise<boolean> {
  return verify((await cookies()).get(COOKIE)?.value)
}

/** Redirects to the login page. For pages and layouts. */
export async function requireAdmin(): Promise<void> {
  if (!(await isSignedIn())) redirect('/admin/login')
}

/**
 * Throws rather than redirecting. For Server Actions, where a redirect would
 * read as success to a caller that never asked for HTML.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isSignedIn())) throw new Error('Unauthorized')
}

export const ADMIN_COOKIE = COOKIE
