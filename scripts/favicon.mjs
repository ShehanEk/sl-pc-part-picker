/**
 * Generates the site's icons from the SVG below. Run once after changing it:
 *
 *   node scripts/favicon.mjs
 *
 * Writes three files Next picks up by name from src/app/: icon.svg for modern
 * browsers, favicon.ico (16, 32, 48) for the rest and for Windows, and
 * apple-icon.png for phone home screens. The design, a processor with "Rs" on
 * it, is the "Favicon options" board on the Claude Design canvas.
 *
 * "Rs" is drawn as strokes, not text, so it looks the same on every device
 * whatever fonts it has.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app')
const BLUE = '#2f6dd3'

// Three pins on each side of the chip.
const pins = [23.5, 32, 40.5]
  .map((p) => `M${p} 9V15M${p} 49v6M9 ${p}H15M49 ${p}h6`)
  .join('')

/** `rounded`: false for the Apple icon, which iOS rounds itself. */
const svg = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${BLUE}"/>
<rect x="15" y="15" width="34" height="34" rx="5" fill="none" stroke="#fff" stroke-width="4"/>
<path d="${pins}" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M22 39V25.5h5.5a4.2 4.2 0 0 1 0 8.4H22M27.5 33.9 31 39"/>
<path d="M41.5 31.3c-.8-1.1-2.1-1.7-3.5-1.7-2 0-3.4 1-3.4 2.5 0 3.4 7.3 1.7 7.3 5.1 0 1.6-1.5 2.7-3.7 2.7-1.6 0-3.1-.7-3.9-1.9"/>
</g>
</svg>
`

const png = (size, rounded = true) =>
  sharp(Buffer.from(svg(rounded)), { density: 72 * (size / 64) * 2 })
    .resize(size, size)
    .png()
    .toBuffer()

writeFileSync(join(APP, 'icon.svg'), svg(true))
writeFileSync(join(APP, 'apple-icon.png'), await png(180, false))

// PNG-in-ICO: a 6-byte header, a 16-byte entry per image, then the PNGs.
const SIZES = [16, 32, 48]
const pngs = await Promise.all(SIZES.map((s) => png(s)))
const header = Buffer.alloc(6 + 16 * SIZES.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(SIZES.length, 4)
let offset = header.length
SIZES.forEach((size, i) => {
  const at = 6 + 16 * i
  header.writeUInt8(size, at)
  header.writeUInt8(size, at + 1)
  header.writeUInt16LE(1, at + 4)
  header.writeUInt16LE(32, at + 6)
  header.writeUInt32LE(pngs[i].length, at + 8)
  header.writeUInt32LE(offset, at + 12)
  offset += pngs[i].length
})
writeFileSync(join(APP, 'favicon.ico'), Buffer.concat([header, ...pngs]))

console.log('wrote src/app/icon.svg, apple-icon.png and favicon.ico (16, 32, 48)')
