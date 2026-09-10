import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Phase 0 gate: does the bundled pipeline actually run outside `tsx` and
 * outside Next?
 *
 * Everything downstream assumes it does. This exercises the alias resolution,
 * the ESM/CommonJS mix, the Neon HTTP driver, global fetch, and the template
 * literal that used to hold a raw NUL byte — in one run, before a line of
 * Electron code exists.
 */

const here = dirname(fileURLToPath(import.meta.url))
const desktop = resolve(here, '..')
const repo = resolve(desktop, '..')

// Credentials come from the repo's .env.local for this probe only. The real app
// reads them from encrypted storage and injects them into the runner's env.
for (const line of readFileSync(resolve(repo, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const bundlePath = resolve(desktop, 'dist/pipeline.cjs')

// 1. The bundle must contain no raw NUL byte.
const raw = readFileSync(bundlePath)
console.log('raw NUL bytes in bundle:', raw.indexOf(0) < 0 ? 0 : 'PRESENT — investigate')

// 2. Load it as CommonJS, the way Electron will.
const require = createRequire(import.meta.url)
const pipeline = require(bundlePath)
console.log('exports:', Object.keys(pipeline).sort().join(', '))
console.log('shops:', pipeline.shopKeys.join(', '))

// 3. Runtime shape the scrapers depend on.
console.log('fetch:', typeof globalThis.fetch)
console.log('AbortController:', typeof globalThis.AbortController)
console.log('getSetCookie:', typeof new Response().headers.getSetCookie)

const log = (m) => console.log('   ' + m)

// 4. A tiny dry-run scrape of the shop the whole app exists for.
console.log('\n--- dry-run scrape: gamestreet.lk, 3 products ---')
const result = await pipeline.runScraper('gamestreet.lk', {
  categories: ['gpu'],
  maxProducts: 3,
  dryRun: true,
  log,
})
console.log('RunResult:', JSON.stringify(result))

// 5. A dry-run normalize — this is the code path that held the NUL byte.
console.log('\n--- dry-run normalize, 50 rows ---')
const norm = await pipeline.runNormalize({ limit: 50, dryRun: true, noAi: true, log: () => {} })
console.log('NormalizeResult:', JSON.stringify(norm))

console.log('\nPHASE 0: PASS')
