'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import type { PickerEntry } from '@/queries/parts'

/**
 * Part picker.
 *
 * A custom listbox rather than a native <select>, because the native popup is
 * drawn by the operating system and cannot be styled to match anything around
 * it. Building it by hand also buys the two things that actually matter with 56
 * cards in the list: type-to-filter, and a row rich enough to show price and
 * availability next to the name.
 *
 * Keyboard behaviour follows the ARIA combobox pattern — arrows move, Enter
 * commits, Escape closes, focus returns to the trigger — so it stays usable
 * without a mouse, which a hand-rolled dropdown otherwise quietly takes away.
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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const current = parts.find((p) => p.partId === selected) ?? null

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return parts
    // Match on the words in any order, so "5070 ti" and "ti 5070" both land.
    const terms = q.split(/\s+/)
    return parts.filter((p) => {
      const hay = `${p.model} ${p.brand}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [parts, query])

  // Filtering can shorten the list past the cursor. Clamping while rendering
  // keeps that correct without an effect that sets state and re-renders again.
  const activeIndexSafe = Math.min(activeIndex, Math.max(results.length - 1, 0))

  function openMenu() {
    // Open with the current selection under the cursor, not the top of the list.
    const i = parts.findIndex((p) => p.partId === selected)
    setActiveIndex(i === -1 ? 0 : i)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  function choose(partId: string) {
    setOpen(false)
    setQuery('')
    startTransition(() => {
      router.push(partId ? `/?part=${encodeURIComponent(partId)}` : '/')
    })
  }

  // Moving focus and scrolling are DOM effects, which is what effects are for.
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndexSafe, open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(Math.min(activeIndexSafe + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(Math.max(activeIndexSafe - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(results.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = results[activeIndexSafe]
      if (pick) choose(pick.partId)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openMenu()
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="part-listbox"
        // Not `ios-list`: that class draws a hairline between its children, and
        // the trigger's children are a label and a value, not list rows.
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius)]
                   bg-surface px-4 py-3.5 text-left transition active:bg-fill"
      >
        <span className="shrink-0 text-[1.0625rem]">Graphics card</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`truncate text-[1.0625rem] ${
              current ? 'text-label-secondary' : 'text-label-tertiary'
            }`}
          >
            {pending ? 'Loading…' : (current?.model ?? 'Choose')}
          </span>
          <svg
            viewBox="0 0 12 20"
            className="h-3.5 w-2.5 shrink-0 text-label-tertiary"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2.5 8 6 4.5 9.5 8M2.5 12 6 15.5 9.5 12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="popover absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden
                     rounded-[var(--radius)]"
          onKeyDown={onKeyDown}
        >
          <div className="border-b border-separator p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards"
              aria-label="Search graphics cards"
              className="w-full rounded-lg bg-fill px-3 py-2 text-[1.0625rem] outline-none
                         placeholder:text-label-tertiary"
            />
          </div>

          <ul
            ref={listRef}
            id="part-listbox"
            role="listbox"
            aria-label="Graphics cards"
            className="max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain py-1"
          >
            {results.length === 0 && (
              <li className="px-4 py-6 text-center text-[0.9375rem] text-label-secondary">
                No card matches “{query}”.
              </li>
            )}

            {results.map((p, i) => {
              const isSelected = p.partId === selected
              return (
                <li key={p.partId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={i === activeIndexSafe}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => choose(p.partId)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                      i === activeIndexSafe ? 'bg-fill' : ''
                    }`}
                  >
                    <span
                      className={`w-4 shrink-0 text-blue ${isSelected ? '' : 'invisible'}`}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none">
                        <path
                          d="m1.5 7.5 3.5 3.5 7.5-8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[1.0625rem]">{p.model}</span>
                      <span className="block text-[0.8125rem] text-label-secondary">
                        {p.cheapestInStockLkr !== null
                          ? `in stock at ${p.inStockShopCount} of ${p.shopCount}`
                          : 'out of stock everywhere'}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span
                        className={`block text-[0.9375rem] tabular-nums ${
                          p.cheapestInStockLkr !== null ? '' : 'text-label-tertiary'
                        }`}
                      >
                        Rs{' '}
                        {(p.cheapestInStockLkr ?? p.cheapestLkr).toLocaleString('en-LK')}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
