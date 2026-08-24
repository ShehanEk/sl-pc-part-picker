/**
 * Deterministic extraction of a canonical part identity from a listing title.
 *
 * This runs before any AI call. Most listings follow recognisable patterns, and
 * a regex that either matches or doesn't is cheaper, faster and far more
 * predictable than a model — the AI pass exists for the residue this cannot
 * parse, not as the first resort.
 *
 * Returning `null` is a valid, useful answer: retailer categories are not
 * trustworthy (a motherboard sits in one shop's GPU listing, a UPS in another's
 * power-supply listing), so anything that does not look like the claimed
 * category must fall through rather than be forced into it.
 */

import {
  findChipset,
  intelCorePlatform,
  intelUltraPlatform,
  ryzenPlatform,
} from '@/catalog/platforms'

export type GpuIdentity = {
  category: 'gpu'
  partId: string
  brand: string
  model: string
  vramGb: number | null
  boardPartner: string | null
}

export type PsuIdentity = {
  category: 'psu'
  partId: string
  brand: string
  model: string
  ratedWatts: number
  efficiencyRating: string | null
}

export type CpuIdentity = {
  category: 'cpu'
  partId: string
  brand: string
  model: string
  socket: string
  ramType: 'DDR4' | 'DDR5' | null
}

export type MotherboardIdentity = {
  category: 'motherboard'
  partId: string
  brand: string
  model: string
  socket: string
  ramType: 'DDR4' | 'DDR5' | null
  formFactor: 'ATX' | 'mATX' | 'ITX' | null
}

export type RamIdentity = {
  category: 'ram'
  partId: string
  brand: string
  model: string
  ramType: 'DDR4' | 'DDR5'
  speedMhz: number | null
  capacityGb: number
  modules: number | null
}

export type Identity =
  | GpuIdentity
  | PsuIdentity
  | CpuIdentity
  | MotherboardIdentity
  | RamIdentity

const GPU_BOARD_PARTNERS = [
  'asus', 'msi', 'gigabyte', 'zotac', 'inno3d', 'pny', 'palit', 'galax',
  'colorful', 'sapphire', 'powercolor', 'xfx', 'asrock', 'arktek', 'gainward',
  'evga', 'sparkle', 'nvidia', 'amd', 'intel',
]

const PSU_BRANDS = [
  'corsair', 'antec', 'msi', 'asus', 'thermaltake', 'gigabyte', 'nzxt',
  'gamdias', 'cooler master', 'coolermaster', 'seasonic', 'be quiet',
  'deepcool', 'lian li', 'dark flash', 'darkflash', 'monova', 'fsp',
  'silverstone', 'silver stone', 'xpg', 'adata', 'value top', 'ant esports',
  'aerocool', 'high power', 'gamemax', 'redragon', 'aorus', 'vertex',
]

/** Titles containing these are not power supplies, whatever the shop filed them under. */
const NOT_A_PSU = /\b(ups|surge\s*protect|inverter|stabilizer|kva|avr)\b/i

/** Noise that must not end up in a PSU's model name. */
const PSU_NOISE = new RegExp(
  [
    '80\\s*\\+?\\s*plus', '80\\s*\\+', 'plus',
    'gold', 'bronze', 'platinum', 'titanium', 'silver', 'white',
    // Separators here must allow a hyphen: retailers write "Non-Modular" as
    // often as "Non Modular", and matching only whitespace left a stray "Non-"
    // in the model name.
    'fully[\\s-]*modular', 'full[\\s-]*modular', 'semi[\\s-]*modular',
    'non[\\s-]*modular', 'modular',
    'power\\s*supply', 'psu', 'certified', 'certificate', 'cybernetics',
    'watts?', 'atx\\s*\\d+(\\.\\d+)?', 'pcie\\s*\\d+', 'premium\\s*edition',
    'edition', 'series', 'gaming', 'digital', 'sfx',
  ].join('|'),
  'gi',
)
// Note: do not add short patterns like `v\d+` here. Without anchoring they eat
// the middle of model codes — `v\d+` turned "CV750" into "C", collapsing it to
// `corsair-750w` and colliding CV750 with CX750 and RM750e. Over-merging two
// different products is a correctness bug; leaving a revision suffix in the id
// is only a dedup nuisance, so this list stays conservative.

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Strip parenthesised asides (almost always warranty blurbs) and trademark
 * marks. The marks matter more than they look: "RTX™ 5070" puts a non-space
 * character between the family and the number, which silently defeats the chip
 * pattern and drops real listings.
 */
const stripAsides = (title: string) =>
  title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[™®℠️]/g, ' ')

function findBrand(title: string, brands: string[]): string | null {
  const lower = title.toLowerCase()
  // Longest first so "cooler master" wins over a bare "cooler".
  const sorted = [...brands].sort((a, b) => b.length - a.length)
  return sorted.find((b) => new RegExp(`\\b${b.replace(/\s/g, '\\s*')}\\b`, 'i').test(lower)) ?? null
}

/**
 * VRAM, e.g. "12GB", "8G", "16 GB".
 *
 * Deliberately refuses a digit glued to surrounding alphanumerics so ASUS-style
 * "O12G" (meaning OC, 12G) and memory types like "GDDR6X" are not mistaken for
 * a capacity.
 */
function extractVramGb(title: string): number | null {
  const matches = [...title.matchAll(/(?<![a-z0-9])(\d{1,3})\s*gb?(?![a-z0-9])/gi)]
  for (const m of matches) {
    const value = Number(m[1])
    // Real cards are 1-64GB; anything else is a model number that looked like one.
    if (value >= 1 && value <= 64) return value
  }
  return null
}

// Intel names its cards "Arc B580" / "Arc A770", so the family may be followed
// by a single letter before the number.
//
// A bare "s" is accepted as SUPER last in the alternation, for vendor part
// codes like "Dual-RTX4070S-O12G". It is safe because a trailing \b is
// required, so "RTX 5070 SOLID" cannot match it. Getting this here matters:
// otherwise the title reaches the AI pass, which is tempted to call a
// 4070 SUPER a 4070 — a different, pricier card.
const GPU_CHIP =
  /\b(rtx|gtx|gt|rx|arc)\s*-?\s*([a-z]?\d{3,4})\s*-?\s*(ti\s*super|super|ti|xtx|xt|s)?\b/i

export function extractGpu(rawTitle: string): GpuIdentity | null {
  const title = stripAsides(rawTitle)
  const chip = title.match(GPU_CHIP)
  if (!chip) return null

  const family = chip[1].toUpperCase()
  const number = chip[2]
  const variantRaw = chip[3]?.replace(/\s+/g, ' ').trim().toLowerCase() ?? null

  const variant = variantRaw
    ? variantRaw === 'ti super'
      ? 'Ti Super'
      : variantRaw === 'ti'
        ? 'Ti'
        : variantRaw === 's'
          ? 'Super'
          : variantRaw.toUpperCase()
    : null

  const vendor =
    family === 'RX' ? 'AMD' : family === 'ARC' ? 'Intel' : 'Nvidia'

  const vramGb = extractVramGb(title)

  // Workstation cards reuse a number across generations — an "RTX 2000 Ada" and
  // an "RTX PRO 2000 Blackwell" are different products that both read as
  // "RTX 2000 16GB" once the architecture is dropped. No consumer listing in
  // the corpus names its architecture, so folding it in only ever separates
  // cards that genuinely differ.
  const arch = title.match(/\b(ada|blackwell|ampere|turing|pascal)\b/i)?.[1] ?? null
  const archDisplay = arch ? arch[0].toUpperCase() + arch.slice(1).toLowerCase() : null

  const displayFamily = family === 'ARC' ? 'Arc' : family
  const model = [displayFamily, number, variant, archDisplay, vramGb ? `${vramGb}GB` : null]
    .filter(Boolean)
    .join(' ')

  // The canonical part is the chip SKU, not the board-partner card: an ASUS and
  // an MSI RTX 5070 12GB are the same thing for price comparison and for every
  // compatibility rule we run.
  const partId = slug(
    [displayFamily, number, variant, arch, vramGb ? `${vramGb}gb` : null]
      .filter(Boolean)
      .join('-'),
  )

  return {
    category: 'gpu',
    partId,
    brand: vendor,
    model,
    vramGb,
    boardPartner: findBrand(title, GPU_BOARD_PARTNERS),
  }
}

const plausibleWatts = (value: number) => value >= 200 && value <= 2400

function extractWatts(title: string): number | null {
  // Stated outright: "750W", "1000 WATT".
  for (const m of title.matchAll(/(?<![a-z0-9.])(\d{3,4})\s*(?:w\b|watts?\b)/gi)) {
    const value = Number(m[1])
    if (plausibleWatts(value)) return value
  }

  // Otherwise it is usually baked into the model code — CV750, C1000, A850GL,
  // DQ750M, P1000W, HX1200i. Requiring a multiple of 50 keeps this from reading
  // arbitrary model numbers as wattage, since real PSUs are always sold in
  // 50W steps.
  for (const m of title.matchAll(/\b([a-z]{0,4})(\d{3,4})([a-z]{0,3})\b/gi)) {
    const value = Number(m[2])
    if (plausibleWatts(value) && value % 50 === 0) return value
  }

  return null
}

function extractEfficiency(title: string): string | null {
  const m = title.match(/80\s*\+?\s*(?:plus)?\s*(gold|bronze|platinum|titanium|silver)/i)
  if (m) return `80+ ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}`
  // Some titles drop the "80+" and just say the tier.
  const bare = title.match(/\b(gold|bronze|platinum|titanium)\b/i)
  return bare ? `80+ ${bare[1][0].toUpperCase()}${bare[1].slice(1).toLowerCase()}` : null
}

export function extractPsu(rawTitle: string): PsuIdentity | null {
  const title = stripAsides(rawTitle)
  if (NOT_A_PSU.test(title)) return null

  const ratedWatts = extractWatts(title)
  if (ratedWatts === null) return null

  const brand = findBrand(title, PSU_BRANDS)
  if (!brand) return null

  // What remains after removing the brand, the wattage and the marketing words
  // is the model designation, e.g. "RMx Series RM1000x" → "rmx rm1000x".
  const modelTokens = title
    .replace(new RegExp(`\\b${brand.replace(/\s/g, '\\s*')}\\b`, 'gi'), ' ')
    .replace(/(?<![a-z0-9.])\d{3,4}\s*(?:w\b|watts?\b)/gi, ' ')
    .replace(PSU_NOISE, ' ')
    .replace(/[^a-z0-9+\-\s]/gi, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !/^\d+$/.test(t))
    // Retailers sometimes stutter a sub-brand ("ASUS ROG ROG Strix 850W"),
    // which would otherwise mint a second part for the same product.
    .filter((t, i, all) => i === 0 || t.toLowerCase() !== all[i - 1].toLowerCase())

  const efficiencyRating = extractEfficiency(title)
  const modelSlug = slug(modelTokens.join('-'))
  const brandSlug = slug(brand)

  // The efficiency tier is part of the product identity, not just a badge:
  // "ASUS ROG Strix 850W Gold" and "…850W Platinum" are separate SKUs at
  // separate prices, and without this they collapse into one part and the
  // cheapest-price badge compares them against each other.
  const tierSlug = efficiencyRating ? slug(efficiencyRating.replace('80+', '')) : null

  return {
    category: 'psu',
    partId: [brandSlug, modelSlug, `${ratedWatts}w`, tierSlug].filter(Boolean).join('-'),
    brand: brand.replace(/\b\w/g, (c) => c.toUpperCase()),
    model: [modelTokens.join(' '), `${ratedWatts}W`].filter(Boolean).join(' ').trim(),
    ratedWatts,
    efficiencyRating,
  }
}

// ---------------------------------------------------------------------------
// CPU

/**
 * Processors.
 *
 * The socket comes from the model number rather than a per-chip lookup, so this
 * resolves chips the catalogue has never seen. Power draw is deliberately left
 * null: it ranges from 35W to 170W within one generation and never appears in a
 * listing, and the PSU rule may not run on a guess.
 */
export function extractCpu(rawTitle: string): CpuIdentity | null {
  const title = stripAsides(rawTitle)

  // Intel Core Ultra 200 series: "Core Ultra 9 Processor 285K"
  const ultra = title.match(/\bcore\s+ultra\s+(\d)\b[^0-9]{0,20}(\d{3})([a-z]{0,2})\b/i)
  if (ultra) {
    const platform = intelUltraPlatform(Number(ultra[2]))
    if (platform) {
      const suffix = ultra[3].toUpperCase()
      const model = `Core Ultra ${ultra[1]} ${ultra[2]}${suffix}`
      return {
        category: 'cpu',
        partId: slug(`intel-core-ultra-${ultra[1]}-${ultra[2]}${suffix}`),
        brand: 'Intel',
        model,
        socket: platform.socket,
        ramType: platform.ramType,
      }
    }
  }

  // Intel Core i-series: "CORE i5 13600K", "Core I5-14400F", "i7 12700"
  const corei = title.match(/\bi([3579])[\s-]*(\d{4,5})\s*([a-z]{0,2})\b/i)
  if (corei) {
    const platform = intelCorePlatform(Number(corei[2]))
    if (platform) {
      const suffix = corei[3].toUpperCase()
      const model = `Core i${corei[1]}-${corei[2]}${suffix}`
      return {
        category: 'cpu',
        partId: slug(`intel-core-i${corei[1]}-${corei[2]}${suffix}`),
        brand: 'Intel',
        model,
        socket: platform.socket,
        ramType: platform.ramType,
      }
    }
  }

  // AMD Ryzen: "Ryzen 7 7800X3D", "Ryzen 5 5600GT"
  // "Pro" is a business-line badge that does not change the socket, so it is
  // skipped rather than blocking the match.
  const ryzen = title.match(/\bryzen\s+(\d)\s+(?:pro\s+)?(\d{4})\s*([a-z0-9]{0,4}?)\b/i)
  if (ryzen) {
    const platform = ryzenPlatform(Number(ryzen[2]))
    if (platform) {
      const suffix = ryzen[3].toUpperCase()
      const model = `Ryzen ${ryzen[1]} ${ryzen[2]}${suffix}`
      return {
        category: 'cpu',
        partId: slug(`amd-ryzen-${ryzen[1]}-${ryzen[2]}${suffix}`),
        brand: 'AMD',
        model,
        socket: platform.socket,
        ramType: platform.ramType,
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Motherboard

const BOARD_BRANDS = [
  'asus', 'msi', 'gigabyte', 'asrock', 'nzxt', 'biostar', 'colorful', 'maxsun',
  'aorus', 'evga',
]

/** Marketing words that must not survive into a board's model name. */
const BOARD_NOISE = new RegExp(
  [
    'motherboard', 'mother\\s*board', 'mainboard',
    'wi[\\s-]*fi', 'wifi', 'ax\\b',
    'ddr[45]', '\\bd[45]\\b',
    'micro\\s*atx', 'matx', 'mini[\\s-]*itx', '\\bitx\\b', '\\batx\\b',
    'gaming', 'series', 'edition',
  ].join('|'),
  'gi',
)

/**
 * Motherboards.
 *
 * The chipset in the title determines the socket and, for most platforms, the
 * memory generation. Intel's 600 and 700 series ship in both DDR4 and DDR5
 * variants, so for those the title has to say — and it nearly always does.
 */
export function extractMotherboard(rawTitle: string): MotherboardIdentity | null {
  const title = stripAsides(rawTitle)
  const chip = findChipset(title)
  if (!chip) return null

  const explicitDdr = /\bddr5\b|\bd5\b/i.test(title)
    ? 'DDR5'
    : /\bddr4\b|\bd4\b/i.test(title)
      ? 'DDR4'
      : null

  // The platform wins where it is unambiguous; the title only decides for the
  // generations that genuinely ship both.
  const ramType = chip.ramType ?? explicitDdr

  const formFactor: MotherboardIdentity['formFactor'] = /mini[\s-]*itx|\bitx\b/i.test(title)
    ? 'ITX'
    : chip.microAtx || /micro\s*atx|\bmatx\b/i.test(title)
      ? 'mATX'
      : 'ATX'

  const brand = findBrand(title, BOARD_BRANDS)

  const modelTokens = title
    .replace(brand ? new RegExp(`\\b${brand.replace(/\s/g, '\\s*')}\\b`, 'gi') : /(?!)/g, ' ')
    .replace(BOARD_NOISE, ' ')
    .replace(/[^a-z0-9+\-\s]/gi, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .filter((t, i, all) => i === 0 || t.toLowerCase() !== all[i - 1].toLowerCase())

  return {
    category: 'motherboard',
    partId: slug([brand, modelTokens.join('-'), ramType].filter(Boolean).join('-')),
    brand: brand ? brand.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unknown',
    model: [modelTokens.join(' '), ramType].filter(Boolean).join(' ').trim(),
    socket: chip.socket,
    ramType,
    formFactor,
  }
}

// ---------------------------------------------------------------------------
// RAM

const RAM_BRANDS = [
  'corsair', 'kingston', 'adata', 'xpg', 'g.skill', 'gskill', 'crucial',
  'teamgroup', 'team', 't-force', 'tforce', 't-create', 'patriot', 'lexar',
  'netac', 'transcend', 'pny', 'addgame', 'memoryghost', 'silicon power',
  'apacer', 'klevv', 'zadak', 'v-color', 'vcolor',
]

/** Memory that cannot go in a desktop build, whatever the shop filed it under. */
const NOT_DESKTOP_RAM = /\bso[\s-]*dimm\b|\blaptop\b|\bnotebook\b|\blap\s*ram\b|\bsodimm\b/i

/**
 * Memory.
 *
 * The most extractable category by far — capacity, generation, speed and often
 * the kit layout are all stated in the title.
 *
 * Laptop modules are rejected outright. Shops file SO-DIMM memory in the same
 * category, and it physically cannot go in a desktop board, so offering it in a
 * build would be worse than omitting it.
 */
export function extractRam(rawTitle: string): RamIdentity | null {
  const title = stripAsides(rawTitle)
  if (NOT_DESKTOP_RAM.test(rawTitle)) return null

  const stated = /\bddr5\b/i.test(title) ? 'DDR5' : /\bddr4\b/i.test(title) ? 'DDR4' : null

  // Kit layout: "(2X16GB)", "(1x8GB)", "(2X16)".
  // Read from the raw title on purpose — stripAsides removes parenthesised
  // text, which is exactly where the stick count lives.
  // The GB is optional: shops write "(2X16GB)" and bare "(2X16)" alike.
  const kit = rawTitle.match(/\((\d)\s*[x×]\s*(\d{1,3})\s*(?:gb?)?\)/i)
  const modules = kit ? Number(kit[1]) : null

  // Total capacity is the standalone figure, not the per-stick one inside the kit.
  const capacityMatch = [...title.matchAll(/(?<![a-z0-9x×])(\d{1,3})\s*gb\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 2 && n <= 512)
  const capacityGb = capacityMatch[0] ?? null
  if (capacityGb === null) return null

  // "3200MHZ", "3600MT/s", "DDR5-4800"
  const speed =
    title.match(/(\d{4,5})\s*(?:mhz|mt\/s)/i)?.[1] ??
    title.match(/ddr[45][\s-](\d{4,5})/i)?.[1] ??
    null
  const speedMhz = speed ? Number(speed) : null

  /**
   * A third of desktop memory listings never name the generation — "Kingston
   * 16GB 3200MHZ Desktop Memory". The data rate settles it: DDR5's JEDEC floor
   * is 4800 MT/s and no DDR5 module runs slower, while DDR4 tops out around
   * 4000 even on aggressive XMP kits.
   *
   * The band between is left unresolved rather than guessed. Getting this wrong
   * puts a DDR4 stick in a DDR5 board, which is a hard failure, so the gap is
   * deliberately wide — in this corpus the labelled titles cluster at 3200/3600
   * for DDR4 and 4800 and above for DDR5, with nothing in between.
   */
  const ramType =
    stated ??
    (speedMhz === null ? null : speedMhz <= 4000 ? 'DDR4' : speedMhz >= 4800 ? 'DDR5' : null)
  if (!ramType) return null

  const brand = findBrand(title, RAM_BRANDS)

  return {
    category: 'ram',
    partId: slug(
      [
        brand ?? 'generic',
        `${capacityGb}gb`,
        modules ? `${modules}x` : null,
        ramType,
        speedMhz ? `${speedMhz}` : null,
      ]
        .filter(Boolean)
        .join('-'),
    ),
    brand: brand ? brand.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unbranded',
    model: [
      `${capacityGb}GB`,
      modules ? `(${modules}x${capacityGb / modules}GB)` : null,
      ramType,
      speedMhz ? `${speedMhz}MHz` : null,
    ]
      .filter(Boolean)
      .join(' '),
    ramType,
    speedMhz,
    capacityGb,
    modules,
  }
}

/** Extract using the category the retailer claimed, returning null if it disagrees. */
export function extractIdentity(
  category: string,
  rawTitle: string,
): Identity | null {
  if (category === 'gpu') return extractGpu(rawTitle)
  if (category === 'psu') return extractPsu(rawTitle)
  if (category === 'cpu') return extractCpu(rawTitle)
  if (category === 'motherboard') return extractMotherboard(rawTitle)
  if (category === 'ram') return extractRam(rawTitle)
  return null
}
