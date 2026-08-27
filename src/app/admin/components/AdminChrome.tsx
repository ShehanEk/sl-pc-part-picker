import Link from 'next/link'

import { signOutAction } from '../actions'

/**
 * Admin header. Deliberately not `SiteHeader` — that one runs a catalogue
 * query on every render and carries buyer-facing copy, neither of which
 * belongs on an operations page. It borrows the same glass classes so the two
 * still read as one product.
 */
export function AdminHeader({ current }: { current: 'overview' | 'gaps' }) {
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
        active
          ? 'bg-[var(--accent)] text-white'
          : 'border border-[var(--glass-border)] bg-white/80 text-ink-2 hover:-translate-y-px'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <header className="glass-header sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
      <div className="flex items-center gap-4">
        <span className="text-[15.5px] font-bold tracking-[-0.025em]">
          PC Maker<span className="text-accent">.lk</span>
          <span className="ml-2 rounded-full bg-[rgb(30_50_100/7%)] px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-2">
            admin
          </span>
        </span>
        <nav className="flex items-center gap-2">
          {tab('/admin', 'Overview', current === 'overview')}
          {tab('/admin/gaps', 'Missing data', current === 'gaps')}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/" className="text-[12.5px] text-ink-3 underline-offset-2 hover:underline">
          View site
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-white/80 px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-[rgb(30_50_100/28%)]"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}

export function Panel({
  title,
  hint,
  children,
}: {
  title: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="glass overflow-hidden">
      <div className="hairline-b px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{title}</h2>
        {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** Status dot with the same three-state vocabulary used across the dashboard. */
export function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'idle' }) {
  const colour =
    tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-bad' : 'bg-[oklch(0.78_0.02_260)]'
  return <span aria-hidden className={`inline-block h-2 w-2 flex-none rounded-full ${colour}`} />
}
