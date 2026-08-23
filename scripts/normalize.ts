import { runNormalize } from '@/pipeline/normalize'

/**
 * CLI for the normalize stage.
 *
 *   npm run normalize
 *   npm run normalize -- --dry-run
 *   npm run normalize -- --redo --no-ai --limit 100
 */
async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`)
    return i !== -1 ? args[i + 1] : undefined
  }

  const result = await runNormalize({
    limit: flag('limit') ? Number(flag('limit')) : undefined,
    redo: args.includes('--redo'),
    noAi: args.includes('--no-ai'),
    dryRun: args.includes('--dry-run'),
  })

  console.table([result])
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
