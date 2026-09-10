/**
 * The pipeline surface the desktop app runs.
 *
 * A thin re-export, deliberately: the desktop must run *the same code* the CLI
 * and CI run, not a copy of it. Anything that behaves differently here would be
 * a second implementation of the scrapers with none of the tests.
 *
 * This is the bundle entry for the runner process. Everything it pulls in —
 * `src/pipeline`, `src/scrapers`, `src/catalog`, `src/normalize`, `src/db`,
 * `src/lib/http` — is free of Next imports and free of native dependencies,
 * which is what makes a single-file CommonJS bundle possible.
 *
 * Note the module-load-time captures it inherits: `MIN_DELAY_MS` and the
 * user-agent in `src/lib/http.ts`, and the cached Neon client in `src/db`.
 * Credentials must be in `process.env` before this module is first required —
 * which is why the runner is spawned with an explicit `env`, rather than being
 * handed configuration afterwards.
 */

export { runScraper, runScrapers } from '@/pipeline/scrape'
export type { RunOptions, RunResult } from '@/pipeline/scrape'

export { runNormalize } from '@/pipeline/normalize'
export type { NormalizeOptions, NormalizeResult } from '@/pipeline/normalize'

export { shopKeys } from '@/scrapers'
