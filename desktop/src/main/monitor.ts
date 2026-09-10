import { join } from 'node:path'

import { get } from './secrets'

/**
 * The database reads the main process makes.
 *
 * Loaded with a runtime `require`, and only after credentials are in
 * `process.env`. `getDb()` caches its Neon client the first time it is called
 * and reads `DATABASE_URL` at that moment — importing this module at the top of
 * the file would bind it before the keychain had been opened.
 *
 * That also means a credential change genuinely requires a restart, which the
 * Settings screen says rather than pretending to hot-swap.
 */

export type AdminQueries = typeof import('./admin-queries')

let cached: AdminQueries | null = null

export function loadQueries(dist: string): AdminQueries {
  if (cached) return cached

  const url = get('DATABASE_URL')
  if (url) process.env.DATABASE_URL = url
  const key = get('ANTHROPIC_API_KEY')
  if (key) process.env.ANTHROPIC_API_KEY = key

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  cached = require(join(dist, 'admin-queries.cjs')) as AdminQueries
  return cached
}

export function hasCredentials(): boolean {
  return Boolean(get('DATABASE_URL'))
}
