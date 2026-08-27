'use client'

import { useActionState } from 'react'

import { signInAction, type SaveState } from '../actions'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(signInAction, {})

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-5">
      <div className="glass px-6 py-7">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em]">
          PC Maker<span className="text-accent">.lk</span> admin
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          Pipeline health, catalogue summary, and the spec fields the compatibility checks are
          waiting on.
        </p>

        <form action={formAction} className="mt-6">
          <label htmlFor="password" className="eyebrow block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="mt-2 h-11 w-full rounded-[var(--radius-sm)] border border-[rgb(30_50_100/11%)] bg-white px-4 text-[14px] outline-none focus:border-[var(--accent)]"
          />

          {state.error && (
            <p role="alert" className="mt-3 text-[12.5px] text-bad">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-5 w-full rounded-[var(--radius-sm)] bg-[var(--accent)] py-3 text-[14px] text-white disabled:opacity-60"
          >
            {pending ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
