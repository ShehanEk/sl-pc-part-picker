import { applyCuratedSpecs } from '@/catalog/apply'
import { applyOverrides } from '@/catalog/overrides'

/**
 * Apply the curated spec catalog and report coverage.
 *
 *   npm run seed:specs
 *
 * Safe to re-run: it only writes curated values onto parts that already exist.
 */
async function main() {
  const r = await applyCuratedSpecs()

  // Same order as the normalize run: curated first, hand-entered on top, so
  // this command stays a faithful "apply everything the catalog knows".
  const o = await applyOverrides()
  if (o.overrides > 0) {
    console.log(
      `Overrides   : ${o.partsUpdated}/${o.overrides} applied` +
        (o.orphaned.length ? `, ${o.orphaned.length} orphaned` : ''),
    )
    for (const d of o.disagreements) {
      console.log(`   ${d.partId}.${d.field}: ${d.was} -> ${d.now}`)
    }
  }

  console.log(`GPU entries : ${r.curatedEntries} curated, ${r.partsUpdated} applied`)
  console.log(
    `PSU entries : ${r.psuEntries} curated, ${r.psusUpdated} applied, ` +
      `${r.psusUncovered} still without a connector list`,
  )
  console.log(
    `CPU entries : ${r.cpuEntries} curated, ${r.cpusUpdated} applied, ` +
      `${r.cpusUncovered} still without a published draw`,
  )

  if (r.aliasesFolded.length) {
    console.log(`\nfolded duplicate parts (listings omitting memory size):`)
    for (const a of r.aliasesFolded) console.log(`   ${a}`)
  }

  if (r.notStocked.length) {
    console.log(`\ncurated but not stocked locally: ${r.notStocked.join(', ')}`)
  }

  if (r.uncovered.length) {
    console.log(`\nGPU parts still without curated specs (${r.uncovered.length}), most-stocked first:`)
    for (const u of r.uncovered.slice(0, 20)) {
      console.log(`   ${u.partId.padEnd(26)} ${u.shops} shop(s)`)
    }
    if (r.uncovered.length > 20) console.log(`   ... and ${r.uncovered.length - 20} more`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
