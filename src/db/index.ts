import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'

import * as schema from './schema'

let cached: NeonHttpDatabase<typeof schema> | null = null

/**
 * Lazily connect on first use.
 *
 * Deliberately not a module-level connection: the scrapers import this module
 * transitively, and a `--dry-run` scrape must work without database credentials.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!cached) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    cached = drizzle(neon(url), { schema })
  }
  return cached
}

export * from './schema'
