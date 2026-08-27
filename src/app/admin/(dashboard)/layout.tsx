import { requireAdmin } from '@/lib/admin-auth'

/**
 * The gate. Everything under this route group is behind it.
 *
 * `force-dynamic` because reading cookies already makes these pages dynamic —
 * stating it stops anyone later adding a prerender that would serve one
 * operator's page to whoever asked next.
 */
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()
  return children
}
