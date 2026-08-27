import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AdminHeader, Panel } from '../../../components/AdminChrome'
import { EditForm, type EditableRow } from '../../../components/EditForm'

import { CHECK_LABEL, FIELDS, gapsForPart } from '@/catalog/gaps'
import type { BuildSlot } from '@/compat/build'
import { CATEGORY_COPY, rupees } from '@/lib/site'
import { getEvidenceFor, getPartForEdit } from '@/queries/admin'

export const dynamic = 'force-dynamic'

/** Render an array or scalar column as the form's string representation. */
function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.length ? value.join(', ') : null
  return String(value)
}

export default async function EditPartPage({
  params,
}: {
  params: Promise<{ partId: string }>
}) {
  const { partId } = await params
  const data = await getPartForEdit(partId)
  if (!data) notFound()

  const { part, override, offers } = data
  const category = part.category as BuildSlot
  const evidence = await getEvidenceFor(partId)
  const gapFields = new Set(gapsForPart(part).map((g) => g.field))

  const rows: EditableRow[] = (FIELDS[category] ?? []).map((spec) => {
    const current = asText(part[spec.field as keyof typeof part])
    return {
      spec,
      current,
      overridden: override ? asText(override[spec.field as keyof typeof override]) : null,
      isGap: gapFields.has(spec.field),
      // Filling a null is safe; changing a set value would make the part's URL
      // disagree with its own specs.
      lockedByIdentity: Boolean(spec.identityBearing) && current !== null,
    }
  })

  return (
    <>
      <AdminHeader current="gaps" />

      <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-8 sm:px-8">
        <nav className="mb-4 text-[12.5px] text-ink-3">
          <Link href="/admin/gaps" className="underline-offset-2 hover:underline">
            Missing data
          </Link>
          <span className="mx-2 text-ink-4">/</span>
          <span className="text-ink-2">{part.model}</span>
        </nav>

        <h1 className="text-[24px] font-semibold tracking-[-0.03em]">{part.model}</h1>
        <p className="mono mt-1.5 text-[12px] text-ink-3">
          {part.brand} · {CATEGORY_COPY[category].heading} · {partId}
        </p>
        <p className="mt-2 text-[12.5px] text-ink-3">
          <Link
            href={`/${category}/${partId}`}
            className="text-accent underline-offset-2 hover:underline"
          >
            View the public page
          </Link>
        </p>

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_clamp(300px,32vw,400px)]">
          <div className="min-w-0">
            <EditForm
              partId={partId}
              rows={rows}
              note={override?.note ?? null}
              checkLabels={CHECK_LABEL}
            />
          </div>

          <aside className="min-w-0 grid gap-5">
            <Panel
              title="What the shops published"
              hint="Spec tables the scrapers already landed. The normalizer does not read most of these, so this is usually the fastest source — and it is a citation, not a recollection."
            >
              {evidence.length === 0 ? (
                <p className="px-5 py-6 text-[12.5px] text-ink-3">
                  No spec tables landed for this part.
                </p>
              ) : (
                evidence.map((e) => (
                  <div key={e.shop} className="hairline-b px-5 py-3.5 last:border-b-0">
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener nofollow"
                      className="text-[13px] underline-offset-2 hover:text-accent hover:underline"
                    >
                      {e.shop}
                    </a>
                    {Object.keys(e.specs).length === 0 ? (
                      <p className="mt-1 text-[11.5px] text-ink-4">No spec table — title only.</p>
                    ) : (
                      <dl className="mt-2 grid gap-1">
                        {Object.entries(e.specs).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3 text-[11.5px]">
                            <dt className="text-ink-3">{k}</dt>
                            <dd className="mono text-right text-ink-2">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                ))
              )}
            </Panel>

            <Panel title="Listings" hint={`${offers.length} shop(s)`}>
              {offers.map((o) => (
                <div
                  key={o.shop}
                  className="hairline-b flex items-center justify-between gap-3 px-5 py-2.5 text-[12.5px] last:border-b-0"
                >
                  <span className={o.inStock ? '' : 'text-ink-4'}>
                    {o.shop}
                    {!o.inStock && ' · out of stock'}
                  </span>
                  <span className="mono">{rupees(o.priceLkr)}</span>
                </div>
              ))}
            </Panel>
          </aside>
        </div>
      </div>
    </>
  )
}
