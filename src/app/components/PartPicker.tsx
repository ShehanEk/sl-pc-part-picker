'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import type { PickerEntry } from '@/queries/parts'

/**
 * The one control on the page.
 *
 * Kept as a native <select> deliberately: on iOS and macOS it opens the system
 * picker, which is both the most Apple-feeling and the most usable option on a
 * phone. It is styled as an iOS list row with a disclosure chevron rather than
 * a form field, since that is how Settings presents a choice.
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

  const current = parts.find((p) => p.partId === selected) ?? null

  return (
    <div className="ios-list">
      <div className="relative flex items-center justify-between gap-3 px-4 py-3.5">
        <label htmlFor="part" className="shrink-0 text-[1.0625rem]">
          Graphics card
        </label>

        <span
          className={`flex min-w-0 items-center gap-1.5 text-[1.0625rem] ${
            current ? 'text-label-secondary' : 'text-label-tertiary'
          }`}
        >
          <span className="truncate">{current ? current.model : 'Choose'}</span>
          <svg viewBox="0 0 12 20" className="h-3.5 w-2.5 shrink-0" fill="none" aria-hidden="true">
            <path
              d="M2.5 8 6 4.5 9.5 8M2.5 12 6 15.5 9.5 12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        {/* Transparent native control laid over the row so the whole row is the
            hit target while the system picker still does the work. */}
        <select
          id="part"
          value={selected ?? ''}
          disabled={pending}
          aria-label="Choose a graphics card"
          onChange={(e) => {
            const value = e.target.value
            startTransition(() => {
              router.push(value ? `/?part=${encodeURIComponent(value)}` : '/')
            })
          }}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        >
          <option value="">Choose a graphics card…</option>
          {parts.map((p) => (
            <option key={p.partId} value={p.partId}>
              {p.model}
              {p.cheapestInStockLkr !== null
                ? ` — from Rs ${p.cheapestInStockLkr.toLocaleString('en-LK')}`
                : ' — out of stock'}
            </option>
          ))}
        </select>
      </div>

      {current && (
        <div className="px-4 py-2.5 text-[0.8125rem] text-label-secondary">
          {current.cheapestInStockLkr !== null
            ? `In stock at ${current.inStockShopCount} of ${current.shopCount} shops`
            : `Listed by ${current.shopCount} ${current.shopCount === 1 ? 'shop' : 'shops'}, none in stock`}
          {pending && ' · loading…'}
        </div>
      )}
    </div>
  )
}
