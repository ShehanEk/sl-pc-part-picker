'use client'

import { useEffect, useRef, useState } from 'react'

import type { BuildSlot } from '@/compat/build'

/**
 * The build, drawn as a machine coming together.
 *
 * The layout is the real one — board on the right, processor and memory on the
 * board, card in a slot below, supply in the basement — so watching it fill in
 * teaches someone who has never opened a case where things actually go. That is
 * the point: it reads as a picture of your build rather than decoration beside
 * it.
 *
 * Empty slots are dashed ghosts, so the drawing doubles as a progress bar. Only
 * the part just chosen animates: this component survives navigation between
 * search params, so it can compare against what it drew last time rather than
 * replaying the whole assembly on every click.
 */
export function CartoonPC({
  filled,
  conflicted,
  complete,
}: {
  filled: BuildSlot[]
  /** Slots whose part conflicts with the rest of the build. */
  conflicted: BuildSlot[]
  /** Everything chosen and nothing failing — the machine powers on. */
  complete: boolean
}) {
  const seen = useRef<Set<BuildSlot> | null>(null)
  const [justAdded, setJustAdded] = useState<BuildSlot | null>(null)

  useEffect(() => {
    const previous = seen.current
    seen.current = new Set(filled)

    // First render: everything is already in place, so nothing should drop in.
    if (previous === null) return

    const added = filled.find((s) => !previous.has(s))
    if (!added) return

    setJustAdded(added)
    const timer = setTimeout(() => setJustAdded(null), 600)
    return () => clearTimeout(timer)
  }, [filled])

  const has = (s: BuildSlot) => filled.includes(s)

  const cls = (s: BuildSlot) =>
    [
      'pc-part',
      has(s) ? '' : 'pc-part--empty',
      justAdded === s ? 'pc-part--dropping' : '',
      conflicted.includes(s) ? 'pc-part--conflict' : '',
    ]
      .filter(Boolean)
      .join(' ')

  return (
    <svg
      viewBox="0 0 320 190"
      className={`w-full max-w-[22rem] ${complete ? 'pc-powered' : ''}`}
      role="img"
      aria-label={
        complete
          ? 'Your build, complete and powered on'
          : `Your build so far: ${filled.length} of 5 parts fitted`
      }
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Case — always present, it is the thing being filled */}
      <g className="text-label-secondary">
        <rect x="8" y="8" width="304" height="174" rx="12" />
        {/* Front panel divider */}
        <path d="M104 8v174" />
        {/* Drive bays */}
        <rect x="20" y="24" width="70" height="14" rx="3" />
        <rect x="20" y="46" width="70" height="14" rx="3" />
        {/* Power button, lit once running */}
        <circle cx="55" cy="80" r="8" />
        <circle
          className="pc-led"
          cx="55"
          cy="80"
          r="3.5"
          fill={complete ? 'var(--green)' : 'currentColor'}
          stroke="none"
          opacity={complete ? 1 : 0.35}
        />
      </g>

      {/* Power supply — the basement */}
      <g className={cls('psu')} style={{ ['--tint' as string]: 'rgb(255 149 0 / 14%)' }}>
        <rect className="pc-tint" x="20" y="130" width="72" height="40" rx="5" />
        <circle className="pc-fan" cx="44" cy="150" r="12" />
        <path className="pc-fan" d="M44 138a12 12 0 0 1 10 6M56 154a12 12 0 0 1-18 6M32 156a12 12 0 0 1 4-16" />
        <path d="M72 140h12M72 150h12M72 160h12" />
      </g>

      {/* Motherboard — the backplane everything else attaches to */}
      <g className={cls('motherboard')} style={{ ['--tint' as string]: 'rgb(52 199 89 / 12%)' }}>
        <rect className="pc-tint" x="120" y="22" width="180" height="146" rx="6" />
        <circle cx="130" cy="32" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="290" cy="32" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="130" cy="158" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="290" cy="158" r="2.5" fill="currentColor" stroke="none" />
      </g>

      {/* Processor — seats on the board, under its cooler */}
      <g className={cls('cpu')} style={{ ['--tint' as string]: 'rgb(0 122 255 / 16%)' }}>
        <rect className="pc-tint" x="138" y="40" width="52" height="52" rx="5" />
        <circle className="pc-fan" cx="164" cy="66" r="18" />
        <circle cx="164" cy="66" r="5" />
        <path
          className="pc-fan"
          d="M164 48a18 18 0 0 1 15 9M179 75a18 18 0 0 1-15 9M149 75a18 18 0 0 1 0-18"
        />
      </g>

      {/* Memory — sticks standing beside the processor */}
      <g className={cls('ram')} style={{ ['--tint' as string]: 'rgb(88 86 214 / 16%)' }}>
        <rect className="pc-tint" x="208" y="36" width="13" height="62" rx="2" />
        <rect className="pc-tint" x="228" y="36" width="13" height="62" rx="2" />
        <path d="M208 88h13M228 88h13" />
      </g>

      {/* Graphics card — slots in horizontally below */}
      <g className={cls('gpu')} style={{ ['--tint' as string]: 'rgb(255 59 48 / 12%)' }}>
        <rect className="pc-tint" x="132" y="112" width="152" height="38" rx="5" />
        <circle className="pc-fan" cx="168" cy="131" r="13" />
        <circle className="pc-fan" cx="212" cy="131" r="13" />
        <path d="M256 120h20M256 131h20M256 142h20" />
      </g>
    </svg>
  )
}
