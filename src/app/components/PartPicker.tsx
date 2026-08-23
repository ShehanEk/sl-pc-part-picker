'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import type { PickerEntry } from '@/queries/parts'

/**
 * The one control on the page. Selecting navigates rather than fetching, so the
 * chosen part lives in the URL and a link to a build can be shared.
 */
export function PartPicker({
  parts,
  selected,
}: {
  parts: PickerEntry[]
  selected: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="part" className="sr-only">
        Choose a graphics card
      </label>
      <select
        id="part"
        value={selected ?? ''}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value
          startTransition(() => {
            router.push(value ? `/?part=${encodeURIComponent(value)}` : '/')
          })
        }}
        className="w-full rounded-lg border border-black/15 bg-white px-4 py-3 text-base
                   shadow-sm outline-none transition focus:border-black/40
                   disabled:opacity-60 dark:border-white/20 dark:bg-neutral-900"
      >
        <option value="">Choose a graphics card…</option>
        {parts.map((p) => (
          <option key={p.partId} value={p.partId}>
            {p.model} —{' '}
            {p.cheapestInStockLkr !== null
              ? `from Rs ${p.cheapestInStockLkr.toLocaleString('en-LK')} (${p.inStockShopCount} in stock)`
              : `Rs ${p.cheapestLkr.toLocaleString('en-LK')} (out of stock)`}
          </option>
        ))}
      </select>
      {pending && <span className="text-sm text-black/50 dark:text-white/50">…</span>}
    </div>
  )
}
