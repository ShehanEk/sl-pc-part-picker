import { runScrapers, shopKeys } from '@/pipeline/scrape'
import type { Category } from '@/scrapers/types'

/**
 * CLI for the scrape stage.
 *
 *   npm run scrape -- all
 *   npm run scrape -- nanotek.lk --categories gpu,psu
 *   npm run scrape -- gamestreet.lk --dry-run --max-products 5
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

  const shops = target === 'all' ? shopKeys : [target]
  const { results, failures } = await runScrapers(shops, {
    categories: flag('categories')?.split(',') as Category[] | undefined,
    maxProducts: flag('max-products') ? Number(flag('max-products')) : undefined,
    maxPages: flag('max-pages') ? Number(flag('max-pages')) : undefined,
    dryRun: args.includes('--dry-run'),
  })

  const totalRows = results.reduce((sum, r) => sum + r.scraped, 0)
  console.log(`\n${results.length}/${shops.length} scrapers ok, ${totalRows} rows scraped`)

  for (const f of failures) console.error(`  FAILED ${f.shop}: ${f.error}`)
  if (failures.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
