/**
 * Generates assets/icon.ico from the SVG below. Run once after changing it:
 *
 *   node scripts/icons.mjs
 *
 * One .ico serves the tray, the window, the taskbar and the desktop shortcut.
 * Sizes up to 24px drop the chip's pins and die: at tray size they are noise,
 * and the two arrows around a square are what make it read as "sync".
 *
 * sharp is resolved from the repo root, where Next already installs it.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icon.ico')
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256]

const svg = (simple) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3B7BE6"/>
      <stop offset="1" stop-color="#2453B8"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <g fill="none" stroke="#fff" stroke-width="${simple ? 24 : 18}">
    <path d="M55.3 170 A84 84 0 0 1 156.7 49.1"/>
    <path d="M200.7 86 A84 84 0 0 1 99.3 206.9"/>
  </g>
  <g fill="#fff">
    <path d="M181.1 58 L159.8 28.9 L146.1 66.5 Z"/>
    <path d="M74.9 198 L96.2 227.1 L109.9 189.5 Z"/>
    ${
      simple
        ? '<rect x="96" y="96" width="64" height="64" rx="10"/>'
        : `<rect x="92" y="92" width="72" height="72" rx="12"/>
    <g stroke="#fff" stroke-width="7" stroke-linecap="round">
      <path d="M108 82v10M128 82v10M148 82v10M108 164v10M128 164v10M148 164v10"/>
      <path d="M82 108h10M82 128h10M82 148h10M164 108h10M164 128h10M164 148h10"/>
    </g>
    <rect x="110" y="110" width="36" height="36" rx="5" fill="#2F6DD3"/>`
    }
  </g>
</svg>`

const pngs = await Promise.all(
  SIZES.map((size) =>
    sharp(Buffer.from(svg(size <= 24)))
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
)

// PNG-in-ICO (Windows Vista+): a 6-byte header, a 16-byte entry per image,
// then the PNGs back to back.
const header = Buffer.alloc(6 + 16 * SIZES.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(SIZES.length, 4)
let offset = header.length
SIZES.forEach((size, i) => {
  const at = 6 + 16 * i
  header.writeUInt8(size === 256 ? 0 : size, at) // 0 means 256
  header.writeUInt8(size === 256 ? 0 : size, at + 1)
  header.writeUInt16LE(1, at + 4) // colour planes
  header.writeUInt16LE(32, at + 6) // bits per pixel
  header.writeUInt32LE(pngs[i].length, at + 8)
  header.writeUInt32LE(offset, at + 12)
  offset += pngs[i].length
})

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, Buffer.concat([header, ...pngs]))
console.log(`wrote ${OUT} (${SIZES.join(', ')}px)`)
