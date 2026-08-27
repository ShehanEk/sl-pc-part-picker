'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { applyOverrideFor } from '@/catalog/overrides'
import { fieldSpec, type EditableField } from '@/catalog/gaps'
import { getDb } from '@/db'
import { partOverrides, parts } from '@/db/schema'
import type { BuildSlot } from '@/compat/build'
import { assertAdmin, signIn, signOut } from '@/lib/admin-auth'

/**
 * Every mutation in the app.
 *
 * A Server Action compiles to a POST endpoint on the page that declares it, and
 * that endpoint is reachable by anyone who can send the request. So every
 * action here starts with `assertAdmin()` — the layout's `requireAdmin()` stops
 * people *seeing* the dashboard, and only this stops them *using* it.
 */

export type SaveState = { ok?: string; error?: string; needsConfirm?: string }

export async function signInAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const result = await signIn(String(formData.get('password') ?? ''))
  if (!result.ok) return { error: result.error }
  redirect('/admin')
}

export async function signOutAction(): Promise<void> {
  await signOut()
  redirect('/admin/login')
}

/** Connector strength, mirroring CONNECTOR_RANK in the normalizer. */
const CONNECTOR_RANK: Record<string, number> = {
  '8pin': 1,
  '2x8pin': 2,
  '12vhpwr': 3,
  '12v-2x6': 3,
}

/**
 * Fields where a smaller value makes a compatibility check more permissive.
 *
 * The project is explicit that a rule may be too strict but must never be too
 * lax — a wrong "your PSU is fine" is a dead build, not a bad suggestion. So
 * lowering one of these is possible but never accidental.
 */
const SAFETY_FIELDS: EditableField[] = ['tdpWatts', 'recommendedPsuWatts', 'ratedWatts']

function parseValue(
  spec: NonNullable<ReturnType<typeof fieldSpec>>,
  raw: FormDataEntryValue | null,
  all: FormData,
): unknown {
  if (spec.kind === 'enum-multi') {
    const picked = all.getAll(spec.field).map(String).filter(Boolean)
    return picked.length ? picked : null
  }
  const value = raw == null ? '' : String(raw).trim()
  if (value === '') return null
  if (spec.kind === 'int') {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${spec.label} must be a positive number.`)
    return Math.round(n)
  }
  if (spec.kind === 'enum') {
    if (!spec.options?.includes(value)) throw new Error(`${spec.label}: "${value}" is not valid.`)
    return value
  }
  return value
}

export async function saveOverride(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await assertAdmin()

  const partId = String(formData.get('partId') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  const confirmed = formData.get('confirmLower') === 'on'
  if (!partId) return { error: 'Missing part.' }
  if (!note) return { error: 'Say where the value came from — an uncited spec is a guess.' }

  const db = getDb()
  // Re-read from the database rather than trusting anything the form says about
  // the part beyond its id. The client legitimately tells us *which* part and
  // *what* to change; it does not get to tell us the rest of the row.
  const part = (await db.select().from(parts).where(eq(parts.partId, partId)))[0]
  if (!part) return { error: 'That part no longer exists.' }

  const category = part.category as BuildSlot
  const patch: Record<string, unknown> = {}

  try {
    for (const [key, spec] of Object.entries(
      Object.fromEntries(
        (formData.getAll('field') as string[]).map((f) => [f, fieldSpec(category, f as EditableField)]),
      ),
    )) {
      if (!spec) continue
      const next = parseValue(spec, formData.get(spec.field), formData)
      if (next === null) continue

      const current = part[spec.field as keyof typeof part]

      // An identity-bearing value is folded into the part_id, and therefore
      // into the public URL. Filling a null is safe — a null contributed no
      // token. Changing one would leave /motherboard/...-ddr4 asserting DDR5.
      if (spec.identityBearing && current !== null && current !== undefined) {
        if (String(current) !== String(next)) {
          return {
            error: `${spec.label} is part of this part's URL and cannot be changed once set. Fix it in the extractor instead.`,
          }
        }
        continue
      }

      if (SAFETY_FIELDS.includes(spec.field) && typeof current === 'number' && typeof next === 'number') {
        if (next < current && !confirmed) {
          return {
            needsConfirm: `${spec.label} would drop from ${current} to ${next}, which makes a safety check more permissive. Confirm below if that is right.`,
          }
        }
      }
      if (spec.field === 'powerConnector' && typeof current === 'string' && typeof next === 'string') {
        if ((CONNECTOR_RANK[next] ?? 0) < (CONNECTOR_RANK[current] ?? 0) && !confirmed) {
          return {
            needsConfirm: `Connector would weaken from ${current} to ${next}. Confirm below if that is right.`,
          }
        }
      }

      patch[key] = next
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid value.' }
  }

  if (Object.keys(patch).length === 0) return { error: 'Nothing to save.' }

  // Two statements, not one transaction: the Neon HTTP driver has none. The
  // order is chosen so a failure is recoverable — the override is the record of
  // intent, and if the second statement fails tonight's normalize run applies
  // it anyway.
  await db
    .insert(partOverrides)
    .values({ partId, note, ...patch })
    .onConflictDoUpdate({
      target: partOverrides.partId,
      set: { ...patch, note, updatedAt: new Date() },
    })
  await applyOverrideFor(partId)

  revalidateTag('catalog', 'max')
  // The public pages are prerendered with their own 30-minute revalidate, so
  // clearing the data tag alone would not re-render them.
  revalidatePath('/')
  revalidatePath(`/${category}`)
  revalidatePath(`/${category}/${partId}`)

  return { ok: `Saved ${Object.keys(patch).length} field(s).` }
}

export async function clearOverride(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await assertAdmin()

  const partId = String(formData.get('partId') ?? '')
  if (!partId) return { error: 'Missing part.' }

  await getDb().delete(partOverrides).where(eq(partOverrides.partId, partId))

  // The `parts` row keeps the value until the pipeline recomputes it — COALESCE
  // cannot un-apply. Say so rather than implying an instant revert.
  revalidateTag('catalog', 'max')
  revalidatePath('/')

  return {
    ok: 'Override removed. The current value stays until the next nightly run recomputes it.',
  }
}
