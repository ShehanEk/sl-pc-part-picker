'use client'

import { useActionState } from 'react'

import { clearOverride, saveOverride, type SaveState } from '../actions'

import type { FieldSpec } from '@/catalog/gaps'

export type EditableRow = {
  spec: FieldSpec
  /** What `parts` currently holds. */
  current: string | null
  /** What the override row holds, if any. */
  overridden: string | null
  isGap: boolean
  lockedByIdentity: boolean
}

/**
 * The edit form.
 *
 * Every field shows the value the pipeline produced next to the one a human
 * set, because the standing hazard of an override is that it quietly masks a
 * better value the pipeline later learns. Seeing both is what makes that
 * recoverable.
 */
export function EditForm({
  partId,
  rows,
  note,
  checkLabels,
}: {
  partId: string
  rows: EditableRow[]
  note: string | null
  checkLabels: Record<string, string>
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(saveOverride, {})
  const [clearState, clearAction, clearing] = useActionState<SaveState, FormData>(
    clearOverride,
    {},
  )

  return (
    <>
      <form action={formAction} className="glass overflow-hidden">
        <input type="hidden" name="partId" value={partId} />

        <div className="hairline-b px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em]">Specifications</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">
            Blank means no opinion — leaving a field empty keeps whatever the pipeline produced.
          </p>
        </div>

        {rows.map(({ spec, current, overridden, isGap, lockedByIdentity }) => (
          <div key={spec.field} className="hairline-b px-5 py-3.5">
            <input type="hidden" name="field" value={spec.field} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={spec.field} className="text-[13.5px]">
                {spec.label}
                {spec.unit && <span className="text-ink-4"> ({spec.unit})</span>}
              </label>
              <span className="flex flex-wrap items-center gap-2 text-[10.5px]">
                {isGap && (
                  <span className="rounded-full bg-[rgb(255_180_100/22%)] px-2 py-[3px] font-semibold uppercase tracking-[0.06em] text-[oklch(0.5_0.13_65)]">
                    missing
                  </span>
                )}
                {spec.unblocks && (
                  <span className="text-ink-4">feeds {checkLabels[spec.unblocks]}</span>
                )}
                {lockedByIdentity && (
                  <span className="text-ink-4" title="This value is part of the part's URL">
                    fixed — in the URL
                  </span>
                )}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              {spec.kind === 'enum' ? (
                <select
                  id={spec.field}
                  name={spec.field}
                  defaultValue={overridden ?? ''}
                  disabled={lockedByIdentity}
                  className="h-10 min-w-[180px] rounded-[var(--radius-sm)] border border-[rgb(30_50_100/11%)] bg-white px-3 text-[13px] disabled:opacity-50"
                >
                  <option value="">— no change —</option>
                  {spec.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : spec.kind === 'enum-multi' ? (
                <span className="flex flex-wrap gap-3">
                  {spec.options?.map((o) => (
                    <label key={o} className="flex items-center gap-1.5 text-[12.5px]">
                      <input
                        type="checkbox"
                        name={spec.field}
                        value={o}
                        defaultChecked={overridden?.includes(o) ?? false}
                      />
                      {o}
                    </label>
                  ))}
                </span>
              ) : (
                <input
                  id={spec.field}
                  name={spec.field}
                  type={spec.kind === 'int' ? 'number' : 'text'}
                  min={spec.kind === 'int' ? 1 : undefined}
                  defaultValue={overridden ?? ''}
                  disabled={lockedByIdentity}
                  placeholder={current ?? 'empty'}
                  className="h-10 min-w-[180px] rounded-[var(--radius-sm)] border border-[rgb(30_50_100/11%)] bg-white px-3 text-[13px] disabled:opacity-50"
                />
              )}

              <span className="mono text-[11.5px] text-ink-4">
                pipeline: {current ?? '—'}
                {overridden !== null && (
                  <>
                    {' · '}
                    <span className="text-accent">yours: {overridden}</span>
                  </>
                )}
              </span>
            </div>
          </div>
        ))}

        <div className="bg-[var(--sunken)] px-5 py-4">
          <label htmlFor="note" className="eyebrow block">
            Source (required)
          </label>
          <input
            id="note"
            name="note"
            defaultValue={note ?? ''}
            required
            placeholder="https://… — where you read these values"
            className="mt-2 h-10 w-full rounded-[var(--radius-sm)] border border-[rgb(30_50_100/11%)] bg-white px-3 text-[13px]"
          />
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
            The project does not accept uncited specs: a wrong value here produces a confident
            wrong answer about whether someone&apos;s build will work.
          </p>

          {state.needsConfirm && (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-[rgb(255_180_100/45%)] bg-[rgb(255_180_100/14%)] px-3.5 py-3">
              <p className="text-[12.5px] text-[oklch(0.45_0.13_65)]">{state.needsConfirm}</p>
              <label className="mt-2 flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" name="confirmLower" />
                Yes, lower it — I have checked the manufacturer&apos;s figure.
              </label>
            </div>
          )}
          {state.error && (
            <p role="alert" className="mt-3 text-[12.5px] text-bad">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p role="status" className="mt-3 text-[12.5px] text-ok">
              {state.ok}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2.5 text-[13.5px] text-white disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {note !== null && (
        <form action={clearAction} className="mt-4">
          <input type="hidden" name="partId" value={partId} />
          <button
            type="submit"
            disabled={clearing}
            className="text-[12.5px] text-ink-3 underline-offset-2 hover:text-bad hover:underline"
          >
            {clearing ? 'Removing…' : 'Remove my overrides for this part'}
          </button>
          {clearState.ok && <p className="mt-2 text-[12px] text-ok">{clearState.ok}</p>}
          {clearState.error && <p className="mt-2 text-[12px] text-bad">{clearState.error}</p>}
        </form>
      )}
    </>
  )
}
