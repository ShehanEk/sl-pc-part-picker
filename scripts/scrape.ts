import { runScraper, shopKeys } from '@/pipeline/scrape'
import {
  RunInProgressError,
  detectActor,
  finishRun,
  reapStaleRuns,
  startRun,
} from '@/pipeline/runs'
import type { RunResult } from '@/pipeline/scrape'
import type { Category } from '@/scrapers/types'

/**
 * CLI for the scrape stage.
 *
 *   npm run scrape -- all
 *   npm run scrape -- nanotek.lk --categories gpu,psu
 *   npm run scrape -- gamestreet.lk --dry-run --max-products 5
 *
 * Loops `runScraper` per shop rather than calling `runScrapers`, because each
 * shop needs its own row in `pipeline_runs` — opened before the work starts, so
 * the row acts as a lease. That lease is what stops this command and the desktop
 * app scraping the same retailer at the same time; GitHub's `concurrency` groups
 * only coordinate runs inside GitHub. `runScrapers` is left untouched for other
 * callers.
 */
async function main() {
  const args = process.argv.slice(2)
  const target = args[0]

  if (!target || target.startsWith('--')) {
    console.error(
      'usage: npm run scrape -- <shop|all> [--categories gpu,psu] [--dry-run] [--max-products N] [--max-pages N]',
    )
    console.error(`shops: ${shopKeys.join(', ')}`)
    process.exit(1)
  }

  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`)
    return i !== -1 ? args[i + 1] : undefined
  }

  const dryRun = args.includes('--dry-run')
  const opts = {
    categories: flag('categories')?.split(',') as Category[] | undefined,
    maxProducts: flag('max-products') ? Number(flag('max-products')) : undefined,
    maxPages: flag('max-pages') ? Number(flag('max-pages')) : undefined,
    dryRun,
  }

  const shops = target === 'all' ? shopKeys : [target]
  const actor = detectActor()

  // Free any lease left behind by a run that died without closing its row.
  await reapStaleRuns()

  const results: RunResult[] = []
  const failures: { shop: string; error: string }[] = []
  const skipped: string[] = []

  for (const shop of shops) {
    let handle
    try {
      handle = await startRun({ kind: 'scrape', shop, actor, dryRun })
    } catch (err) {
      if (err instanceof RunInProgressError) {
        console.error(`  SKIPPED ${shop}: ${err.message}`)
        skipped.push(shop)
        continue
      }
      throw err
    }

    // Kept so a failed run records why, not just that it failed.
    const lines: string[] = []
    const log = (msg: string) => {
      lines.push(msg)
      console.log(msg)
    }

    try {
      const result = await runScraper(shop, { ...opts, log })
      results.push(result)
      await finishRun(handle, { ok: true, result, logTail: lines.join('\n') })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ shop, error: message })
      await finishRun(handle, { ok: false, error: err, logTail: lines.join('\n') })
    }
  }

  const totalRows = results.reduce((sum, r) => sum + r.scraped, 0)
  console.log(`\n${results.length}/${shops.length} scrapers ok, ${totalRows} rows scraped`)

  for (const f of failures) console.error(`  FAILED ${f.shop}: ${f.error}`)

  // A skip is not a success: exiting 0 here would let a nightly job report green
  // while another actor's run was the only thing that actually happened.
  if (failures.length || skipped.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
