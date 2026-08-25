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
      href="/"
      onClick={() => queueAdd(slot, partId, shop)}
      className="mt-4 inline-block rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2.5 text-[13.5px] text-white"
    >
      {children}
    </Link>
  )
}
