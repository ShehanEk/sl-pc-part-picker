'use client'

import { useEffect, useRef, useState } from 'react'

import type { BuildSlot } from '@/compat/build'

/**
 * The build, drawn as an isometric machine assembling itself.
 *
 * Isometric rather than flat: a side-on outline reads as a wiring diagram,
 * whereas boxes with three visible faces read as objects you could pick up. The
 * parts float above the case until chosen and then drop into place, so the
 * picture is an exploded view that resolves as you shop.
 *
 * It sits on its own dark stage in both themes. Neon needs darkness to look
 * like neon — the same glow on a light grey page reads as a smudge.
 */

/** Top face of an isometric box: a rhombus, twice as wide as it is tall. */
const top = (cx: number, cy: number, w: number, h: number) =>
  `${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}`

/** Left-facing side, dropped by `d`. */
const left = (cx: number, cy: number, w: number, h: number, d: number) =>
  `${cx - w},${cy} ${cx},${cy + h} ${cx},${cy + h + d} ${cx - w},${cy + d}`

/** Right-facing side, dropped by `d`. */
const right = (cx: number, cy: number, w: number, h: number, d: number) =>
  `${cx},${cy + h} ${cx + w},${cy} ${cx + w},${cy + d} ${cx},${cy + h + d}`

export function CartoonPC({
  filled,
  conflicted,
  complete,
}: {
  filled: BuildSlot[]
  conflicted: BuildSlot[]
  complete: boolean
}) {
  const seen = useRef<Set<BuildSlot> | null>(null)
  const [justAdded, setJustAdded] = useState<BuildSlot | null>(null)

  useEffect(() => {
    const previous = seen.current
    seen.current = new Set(filled)
    if (previous === null) return
    const added = filled.find((s) => !previous.has(s))
    if (!added) return
    setJustAdded(added)
    const timer = setTimeout(() => setJustAdded(null), 700)
    return () => clearTimeout(timer)
  }, [filled])

  const has = (s: BuildSlot) => filled.includes(s)
  const cls = (s: BuildSlot) =>
    [
      'pc-part',
      has(s) ? '' : 'pc-part--empty',
      justAdded === s ? 'pc-part--fly' : '',
      conflicted.includes(s) ? 'pc-part--conflict' : '',
    ]
      .filter(Boolean)
      .join(' ')

  return (
    <svg
      viewBox="0 0 340 268"
      className={`w-full max-w-[23rem] ${complete ? 'pc-powered' : ''}`}
      role="img"
      aria-label={
        complete
          ? 'Your build, assembled and powered on'
          : `Your build so far: ${filled.length} of 5 parts fitted`
      }
    >
      <defs>
        {/* RGB sweep, used on fans and edge lighting */}
        <linearGradient id="pcRgb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ff2d78" />
        </linearGradient>

        {/* Three faces of every box: lit top, mid left, dark right. */}
        <linearGradient id="faceTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b4570" />
          <stop offset="100%" stopColor="#232b4d" />
        </linearGradient>
        <linearGradient id="faceLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d2340" />
          <stop offset="100%" stopColor="#141930" />
        </linearGradient>
        <linearGradient id="faceRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141930" />
          <stop offset="100%" stopColor="#0d1124" />
        </linearGradient>
        <linearGradient id="boardTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1c5c4a" />
          <stop offset="100%" stopColor="#123c33" />
        </linearGradient>

        <filter id="pcGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

      </defs>

      {/*
        No stage: the machine sits directly on the page.
        The chassis keeps its dark navy faces, which is what a real case looks
        like anyway, so it reads as an object on the desk in either theme rather
        than needing a panel of its own.
      */}

      {/* Floor plate the machine stands on */}
      <polygon
        points={top(170, 214, 132, 66)}
        fill="none"
        stroke="url(#pcRgb)"
        strokeWidth="1.5"
        opacity="0.5"
      />

      {/* --- Case ------------------------------------------------------------ */}
      <g>
        <polygon points={left(150, 196, 74, 37, 34)} fill="url(#faceLeft)" />
        <polygon points={right(150, 196, 74, 37, 34)} fill="url(#faceRight)" />
        <polygon points={top(150, 196, 74, 37)} fill="url(#faceTop)" opacity="0.55" />
        {/* Glass side panel catching the light */}
        <polygon
          points={left(150, 196, 74, 37, 34)}
          fill="url(#pcRgb)"
          opacity="0.16"
        />
        <polygon
          points={left(150, 196, 74, 37, 34)}
          fill="none"
          stroke="url(#pcRgb)"
          strokeWidth="1.6"
          filter="url(#pcGlow)"
          className="pc-edge"
        />
        {/* Front intake fans */}
        <g className="pc-fan-wrap">
          <ellipse className="pc-fan" cx="112" cy="222" rx="11" ry="6" fill="none" stroke="url(#pcRgb)" strokeWidth="1.8" filter="url(#pcGlow)" />
          <ellipse className="pc-fan" cx="112" cy="238" rx="11" ry="6" fill="none" stroke="url(#pcRgb)" strokeWidth="1.8" filter="url(#pcGlow)" />
        </g>
        {/* Power light */}
        <circle className="pc-led" cx="196" cy="220" r="3.2" fill={complete ? '#4ade80' : '#3b4570'} filter={complete ? 'url(#pcGlow)' : undefined} />
      </g>

      {/* --- Power supply, floating to the left ------------------------------ */}
      <g className={cls('psu')} style={{ ['--fly' as string]: '-26px' }}>
        <polygon points={left(52, 168, 30, 15, 18)} fill="url(#faceLeft)" />
        <polygon points={right(52, 168, 30, 15, 18)} fill="url(#faceRight)" />
        <polygon points={top(52, 168, 30, 15)} fill="url(#faceTop)" />
        <ellipse className="pc-fan" cx="52" cy="168" rx="12" ry="6" fill="none" stroke="url(#pcRgb)" strokeWidth="1.6" filter="url(#pcGlow)" />
      </g>

      {/* --- Motherboard, the plane everything mounts to --------------------- */}
      <g className={cls('motherboard')} style={{ ['--fly' as string]: '-34px' }}>
        <polygon points={top(186, 126, 76, 38)} fill="url(#boardTop)" />
        <polygon
          points={top(186, 126, 76, 38)}
          fill="none"
          stroke="#3ddc97"
          strokeWidth="1.3"
          opacity="0.85"
          filter="url(#pcGlow)"
        />
        {/* Traces */}
        <path d="M150 126 L186 108 M186 144 L222 126 M162 138 L198 120" stroke="#3ddc97" strokeWidth="0.9" opacity="0.5" fill="none" />
        <rect x="240" y="118" width="8" height="4" fill="#3ddc97" opacity="0.6" />
      </g>

      {/* --- Processor ------------------------------------------------------- */}
      <g className={cls('cpu')} style={{ ['--fly' as string]: '-52px' }}>
        <polygon points={left(168, 108, 17, 9, 7)} fill="url(#faceLeft)" />
        <polygon points={right(168, 108, 17, 9, 7)} fill="url(#faceRight)" />
        <polygon points={top(168, 108, 17, 9)} fill="url(#faceTop)" />
        <polygon points={top(168, 108, 17, 9)} fill="none" stroke="#38bdf8" strokeWidth="1.4" filter="url(#pcGlow)" />
        <ellipse className="pc-fan" cx="168" cy="108" rx="9" ry="4.6" fill="none" stroke="url(#pcRgb)" strokeWidth="1.5" filter="url(#pcGlow)" />
      </g>

      {/* --- Memory, standing sticks ----------------------------------------- */}
      <g className={cls('ram')} style={{ ['--fly' as string]: '-46px' }}>
        {[0, 1].map((i) => {
          const cx = 232 + i * 13
          const cy = 106 + i * 6.5
          return (
            <g key={i}>
              <polygon points={left(cx, cy, 15, 7.5, 16)} fill="#2a1f4d" />
              <polygon points={right(cx, cy, 15, 7.5, 16)} fill="#1d1636" />
              <polygon points={top(cx, cy, 15, 7.5)} fill="#3b2d6b" />
              <polygon points={top(cx, cy, 15, 7.5)} fill="none" stroke="#a855f7" strokeWidth="1.3" filter="url(#pcGlow)" />
            </g>
          )
        })}
      </g>

      {/* --- Graphics card --------------------------------------------------- */}
      <g className={cls('gpu')} style={{ ['--fly' as string]: '-40px' }}>
        <polygon points={left(178, 164, 62, 31, 9)} fill="url(#faceLeft)" />
        <polygon points={right(178, 164, 62, 31, 9)} fill="url(#faceRight)" />
        <polygon points={top(178, 164, 62, 31)} fill="url(#faceTop)" />
        <polygon points={top(178, 164, 62, 31)} fill="none" stroke="#ff2d78" strokeWidth="1.4" filter="url(#pcGlow)" />
        <ellipse className="pc-fan" cx="152" cy="164" rx="13" ry="6.6" fill="none" stroke="url(#pcRgb)" strokeWidth="1.6" filter="url(#pcGlow)" />
        <ellipse className="pc-fan" cx="196" cy="164" rx="13" ry="6.6" fill="none" stroke="url(#pcRgb)" strokeWidth="1.6" filter="url(#pcGlow)" />
      </g>
    </svg>
  )
}
