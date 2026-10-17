'use client'

import Link from 'next/link'

import type { BuildSlot } from '@/compat/build'
import { queueAdd } from '@/lib/build-store'

/**
 * "Add to my build" on a part page.
 *
 * A link rather than a button, deliberately: the navigation is the point, and
 * queueing the part is the enhancement on top. Without JavaScript it still
 * takes you to the builder — just without the part preselected — instead of
 * being a control that does nothing.
 */
export function AddToBuild({
  slot,
  partId,
  shop,
  children,
}: {
  slot: BuildSlot
  partId: string
  shop: string | null
  children: React.ReactNode
}) {
  return (
    <Link
      href="/build"
      onClick={() => queueAdd(slot, partId, shop)}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--accent-soft-border)] bg-white/90 px-4 text-[14px] font-semibold text-[var(--accent-strong)] transition hover:bg-[var(--accent-soft)]"
    >
      {children}
    </Link>
  )
}
