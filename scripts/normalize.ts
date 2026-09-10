import { runNormalize } from '@/pipeline/normalize'
import {
  RunInProgressError,
  detectActor,
  finishRun,
  reapStaleRuns,
  startRun,
} from '@/pipeline/runs'

/**
 * CLI for the normalize stage.
 *
 *   npm run normalize
 *   npm run normalize -- --dry-run
 *   npm run normalize -- --redo --no-ai --limit 100
 *
 * Wrapped in a `pipeline_runs` row so a failure is recorded rather than only
 * printed, and so two normalize runs cannot overlap — it rewrites `listings`
 * wholesale, and two concurrent passes over the same raw rows would race.
 */
async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`)
    return i !== -1 ? args[i + 1] : undefined
  }

  const dryRun = args.includes('--dry-run')

  await reapStaleRuns()

  let handle
  try {
    handle = await startRun({ kind: 'normalize', actor: detectActor(), dryRun })
  } catch (err) {
    if (err instanceof RunInProgressError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }

  const lines: string[] = []
  const log = (msg: string) => {
    lines.push(msg)
    console.log(msg)
  }

  try {
    const result = await runNormalize({
      limit: flag('limit') ? Number(flag('limit')) : undefined,
      redo: args.includes('--redo'),
      noAi: args.includes('--no-ai'),
      dryRun,
      log,
    })

    await finishRun(handle, { ok: true, result, logTail: lines.join('\n') })
    console.table([result])
  } catch (err) {
    await finishRun(handle, { ok: false, error: err, logTail: lines.join('\n') })
    throw err
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
