import { sql } from 'drizzle-orm'

import { getDb } from '@/db'

/**
 * Push hand-entered spec values onto `parts`.
 *
 * Runs immediately after `applyCuratedSpecs()` at the end of every normalize
 * run, which is the whole design: it makes the provenance ladder
 * **manual > curated > scraped > null**. Without this ordering a hand-entered
 * value lasts until the next nightly run and then quietly disappears —
 * `tdp_watts`, `vram_gb` and `connectors` are rewritten unconditionally by the
 * curated catalog, and the GPU spec patch rewrites four more columns whenever a
 * retailer publishes a spec table.
 *
 * Every column is applied with COALESCE, so a row overrides only the fields it
 * sets; a null means "no opinion", not "force null". That asymmetry is
 * deliberate — the requirement is filling gaps, and a mechanism that could
 * blank a value the pipeline knows is a mechanism that can silently break a
 * compatibility check.
 *
 * One statement for the whole table, not one per part. It is idempotent, so a
 * partial failure self-heals on the next run — which matters because the Neon
 * HTTP driver has no transactions and cannot roll anything back.
 */

/** Columns `part_overrides` mirrors from `parts`. */
const OVERRIDE_COLUMNS = [
  'tdp_watts',
  'vram_gb',
  'power_connector',
  'recommended_psu_watts',
  'socket',
  'ram_type',
  'ram_slots',
  'max_ram_gb',
  'max_supported_speed_mhz',
  'form_factor',
  'speed_mhz',
  'modules',
  'capacity_gb',
  'storage_interface',
  'rated_watts',
  'connectors',
  'efficiency_rating',
] as const

export type ApplyOverridesResult = {
  overrides: number
  partsUpdated: number
  /** Overrides whose part is not in the catalogue — usually a folded alias. */
  orphaned: string[]
  /** Fields where the human disagreed with the pipeline, for the run log. */
  disagreements: { partId: string; field: string; was: string; now: string }[]
}

export async function applyOverrides(): Promise<ApplyOverridesResult> {
  const db = getDb()

  const [{ n: overrides }] = (
    await db.execute(sql`select count(*)::int as n from part_overrides`)
  ).rows as { n: number }[]

  if (overrides === 0) {
    return { overrides: 0, partsUpdated: 0, orphaned: [], disagreements: [] }
  }

  // Recorded before the write, so the log can say what the human changed rather
  // than just how many rows moved. An override that permanently masks a better
  // value the pipeline later learns is the main risk of this whole mechanism;
  // this is what makes it visible.
  const disagreements = (
    await db.execute(
      sql.raw(`
        select o.part_id, f.field, f.was::text as was, f.now::text as now
        from part_overrides o
        join parts p on p.part_id = o.part_id
        cross join lateral (values
          ${OVERRIDE_COLUMNS.map((c) => `('${c}', p.${c}::text, o.${c}::text)`).join(',\n          ')}
        ) as f(field, was, now)
        where f.now is not null and f.was is distinct from f.now
        order by o.part_id, f.field
      `),
    )
  ).rows as { part_id: string; field: string; was: string | null; now: string }[]

  const orphaned = (
    await db.execute(sql`
      select o.part_id from part_overrides o
      where not exists (select 1 from parts p where p.part_id = o.part_id)
    `)
  ).rows as { part_id: string }[]

  const assignments = OVERRIDE_COLUMNS.map(
    (c) => `${c} = coalesce(o.${c}, p.${c})`,
  ).join(',\n      ')

  const updated = await db.execute(
    sql.raw(`
      update parts p set
        ${assignments},
        updated_at = now()
      from part_overrides o
      where p.part_id = o.part_id
    `),
  )

  return {
    overrides,
    partsUpdated: updated.rowCount ?? 0,
    orphaned: orphaned.map((r) => r.part_id),
    disagreements: disagreements.map((d) => ({
      partId: d.part_id,
      field: d.field,
      was: d.was ?? '(empty)',
      now: d.now,
    })),
  }
}

/**
 * Apply the override for a single part, so an admin edit takes effect at once
 * rather than at the next nightly run.
 */
export async function applyOverrideFor(partId: string): Promise<boolean> {
  // The column list is `sql.raw` because it is a fixed constant in this file,
  // but `partId` arrives from an admin form and is bound as a parameter. Do not
  // be tempted to interpolate it into the raw string with hand-escaping —
  // quoting rules are not a substitute for a bind variable.
  const assignments = sql.raw(
    OVERRIDE_COLUMNS.map((c) => `${c} = coalesce(o.${c}, p.${c})`).join(', '),
  )

  const res = await getDb().execute(sql`
    update parts p set ${assignments}, updated_at = now()
    from part_overrides o
    where p.part_id = o.part_id and p.part_id = ${partId}
  `)
  return (res.rowCount ?? 0) > 0
}
