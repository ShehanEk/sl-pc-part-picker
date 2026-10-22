import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactNode } from 'react'

import { ImageResponse } from 'next/og'

import { CATEGORY_STYLE } from '@/app/components/PartIcons'
import type { Category } from '@/lib/site'

/**
 * The share images — what WhatsApp, Facebook and Google show for a link.
 *
 * Drawn by `next/og`, which reads flexbox and a subset of CSS. Two limits
 * shape this file: it cannot parse `oklch()`, so the category colours are
 * repeated here as hex, and it takes only ttf, otf or woff fonts, so it can't
 * use the woff2 files `next/font` serves. The fonts in `assets/fonts` are the
 * same faces as the site's.
 */

export const OG_SIZE = { width: 1200, height: 630 }

const font = (file: string) => readFile(join(process.cwd(), 'assets/fonts', file))

const fonts = Promise.all([
  font('instrument-sans-latin-400-normal.woff'),
  font('instrument-sans-latin-600-normal.woff'),
  font('instrument-sans-latin-700-normal.woff'),
  font('jetbrains-mono-latin-500-normal.woff'),
]).then(([regular, semibold, bold, mono]) => [
  { name: 'Instrument Sans', data: regular, weight: 400 as const, style: 'normal' as const },
  { name: 'Instrument Sans', data: semibold, weight: 600 as const, style: 'normal' as const },
  { name: 'Instrument Sans', data: bold, weight: 700 as const, style: 'normal' as const },
  { name: 'JetBrains Mono', data: mono, weight: 500 as const, style: 'normal' as const },
])

/** `CATEGORY_STYLE`'s tint, ink and strong, converted from oklch. */
const HEX: Record<Category, { tint: string; ink: string; strong: string }> = {
  gpu: { tint: '#dbf6e7', ink: '#008053', strong: '#006d45' },
  cpu: { tint: '#e5efff', ink: '#3760c9', strong: '#2a51b8' },
  motherboard: { tint: '#d9f4fb', ink: '#00778d', strong: '#006477' },
  ram: { tint: '#f8e8ff', ink: '#8c42aa', strong: '#7b3697' },
  storage: { tint: '#ffeacf', ink: '#b46e00', strong: '#8e5400' },
  psu: { tint: '#ffe6e3', ink: '#c53637', strong: '#a92227' },
  case: { tint: '#edf3d1', ink: '#70790e', strong: '#575e0a' },
  peripherals: { tint: '#ffe5f0', ink: '#ae3a70', strong: '#972b5f' },
  laptops: { tint: '#e9eff6', ink: '#3b5876', strong: '#2e4a67' },
  consoles: { tint: '#ffe7d9', ink: '#bc541a', strong: '#9a3c00' },
}

export const INK = '#151b24'
export const MUTED = '#545e6f'
export const LABEL = '#677284'
export const BLUE = '#2f6dd3'
export const MONO = 'JetBrains Mono'

export function CategoryTile({ slot, size }: { slot: Category; size: number }) {
  const { Icon } = CATEGORY_STYLE[slot]
  const { tint, ink } = HEX[slot]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size / 4,
        background: tint,
      }}
    >
      <Icon width={size * 0.58} height={size * 0.58} stroke={ink} />
    </div>
  )
}

export function CategoryChip({ slot, label }: { slot: Category; label: string }) {
  const { Icon } = CATEGORY_STYLE[slot]
  const { tint, ink, strong } = HEX[slot]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px 10px 12px',
        borderRadius: 999,
        background: tint,
        fontSize: 22,
        fontWeight: 600,
        color: strong,
      }}
    >
      <Icon width={30} height={30} stroke={ink} strokeWidth={1.6} />
      {label}
    </div>
  )
}

function Brand() {
  return (
    <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em' }}>
      PCPrice<span style={{ color: BLUE }}>.lk</span>
    </div>
  )
}

/** The frame every share image shares: brand row, body, and a ruled footer. */
export async function ogImage({
  chip,
  body,
  footer,
}: {
  chip?: ReactNode
  body: ReactNode
  footer: ReactNode
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          backgroundColor: '#f4f6fa',
          backgroundImage:
            'radial-gradient(circle at 20% 0%, rgba(110,150,255,0.18) 0%, rgba(110,150,255,0) 55%)',
          color: INK,
          fontFamily: 'Instrument Sans',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Brand />
          {chip}
        </div>
        {body}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 26,
            borderTop: '2px solid rgba(30,50,100,0.09)',
            fontSize: 24,
            color: MUTED,
          }}
        >
          {footer}
          <span>Prices checked every night</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts },
  )
}
