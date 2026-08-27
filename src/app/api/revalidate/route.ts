import { revalidateTag } from 'next/cache'
import { timingSafeEqual } from 'node:crypto'

/**
 * Lets the nightly pipeline clear the read caches when it finishes.
 *
 * Closes a gap the architecture doc has carried since the query layer was
 * written: all ten cached reads share the tag `catalog` with a 30-minute
 * revalidate, and nothing ever invalidated it, so fresh prices sat behind a
 * stale cache for up to half an hour after every run.
 *
 * This is the repo's first route handler — everything else in the app is a page
 * or a Server Action. It exists because GitHub Actions has no other way in.
 */

function authorized(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Two-argument form: the single-argument `revalidateTag(tag)` is deprecated
  // in Next 16.
  revalidateTag('catalog', 'max')

  return Response.json({ revalidated: 'catalog' })
}
