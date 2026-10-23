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

export type StorageIdentity = {
  category: 'storage'
  partId: string
  brand: string
  model: string
  capacityGb: number
  storageInterface: 'm2-nvme' | 'm2-sata' | 'sata' | null
}

export type CaseIdentity = {
  category: 'case'
  partId: string
  brand: string
  model: string
  /** Largest board the case accepts. */
  formFactor: 'ATX' | 'mATX' | 'ITX' | null
}

export type PeripheralIdentity = {
  category: 'peripherals'
  partId: string
  brand: string
  model: string
  peripheralType: 'keyboard' | 'mouse' | 'gamepad'
  wireless: boolean
}

export type Identity =
  | GpuIdentity
  | PsuIdentity
  | CpuIdentity
  | MotherboardIdentity
  | RamIdentity
  | StorageIdentity
  | CaseIdentity
  | PeripheralIdentity
  | LaptopIdentity
  | ConsoleIdentity

export type LaptopIdentity = {
  category: 'laptops'
  partId: string
  brand: string
  model: string
  /** "Core i7-13620H", or only "Core i7" when the listing says no more. */
  cpuModel: string | null
  /** "RTX 4060", "Integrated", or null when the listing does not say. */
  gpuModel: string | null
  memoryGb: number | null
  storageGb: number | null
  screenInches: number | null
  makerCode: string | null
}

export type ConsoleIdentity = {
  category: 'consoles'
  partId: string
  brand: string
  model: string
  consoleType: 'console' | 'handheld'
  platform: 'PlayStation' | 'Xbox' | 'Nintendo' | 'Windows' | 'SteamOS'
}

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
 * VRAM, e.g. "12GB", "8G", "16 GB", and the typo "8GBB".
 *
 * Deliberately refuses a digit glued to surrounding alphanumerics so ASUS-style
 * "O12G" (meaning OC, 12G) and memory types like "GDDR6X" are not mistaken for
 * a capacity.
 *
 * "8GBB" is real: gamestreet.lk listed an "RTX 5060 TI 8GBB" that, read as no
 * capacity at all, was filed under the 16GB card and showed as its cheapest
 * offer, a 33% "deal" that was really a different card.
 */
function extractVramGb(title: string): number | null {
  const matches = [...title.matchAll(/(?<![a-z0-9])(\d{1,3})\s*g(?:bb?)?(?![a-z0-9])/gi)]
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

// ---------------------------------------------------------------------------
// Storage

const STORAGE_BRANDS = [
  'samsung', 'western digital', 'wd', 'seagate', 'crucial', 'kingston',
  'lexar', 'adata', 'xpg', 'corsair', 'msi', 'gigabyte', 'addlink', 'twinmos',
  'netac', 'transcend', 'sandisk', 'pny', 'teamgroup', 'team', 'patriot',
  'hikvision', 'silicon power', 'intel', 'kioxia',
]

/** Filed under storage but not a drive. */
const NOT_STORAGE = /\b(enclosure|caddy|docking|adapter|cable|bracket|cooler|heat\s*sink)\b/i

/**
 * Drives.
 *
 * The interface is the useful part: an M.2 stick and a 2.5-inch SATA drive want
 * different things from the board. It is only recorded when the title says so —
 * a bare "240GB SSD" could be either, and no rule depends on this yet, so a
 * guess would buy nothing.
 */
export function extractStorage(rawTitle: string): StorageIdentity | null {
  const title = stripAsides(rawTitle)
  if (NOT_STORAGE.test(title)) return null

  // A range like "1TB - 4TB" describes several products, not one.
  if (/\d+\s*(tb|gb)\s*[-–]\s*\d+\s*(tb|gb)/i.test(title)) return null

  const tb = title.match(/(?<![a-z0-9])(\d+(?:\.\d+)?)\s*tb\b/i)
  const gb = title.match(/(?<![a-z0-9])(\d{2,4})\s*gb\b/i)
  const capacityGb = tb ? Math.round(Number(tb[1]) * 1000) : gb ? Number(gb[1]) : null
  if (capacityGb === null || capacityGb < 60 || capacityGb > 32000) return null

  const isM2 = /\bm\.?2\b|\b2280\b/i.test(title)
  const isNvme = /\bnvme\b|\bpcie\s*gen|\bpci-?e\s*\d/i.test(title)
  // "SATA3" and "SATA III" are as common as a bare "SATA", and a trailing digit
  // defeats a plain word boundary — which quietly labelled SATA M.2 drives NVMe.
  const isSata = /\bsata\s?(?:3|iii)?\b/i.test(title) || /\b2\.5\b|6gb\/s/i.test(title)

  const storageInterface: StorageIdentity['storageInterface'] = isNvme
    ? 'm2-nvme'
    : isM2 && isSata
      ? 'm2-sata'
      : isM2
        ? 'm2-nvme' // bare "M.2" on a modern drive is overwhelmingly NVMe
        : isSata
          ? 'sata'
          : null

  const brand = findBrand(title, STORAGE_BRANDS)
  const label = capacityGb >= 1000 ? `${capacityGb / 1000}TB` : `${capacityGb}GB`

  // The model code is what separates two drives of the same size from one maker.
  const modelTokens = title
    .replace(brand ? new RegExp(`\\b${brand.replace(/\s/g, '\\s*')}\\b`, 'gi') : /(?!)/g, ' ')
    .replace(
      /\b(ssd|hdd|nvme|sata\d?|m\.?2|2280|pcie|gen\s*\d(x\d)?|solid\s*state\s*drive|internal|desktop|drive|6gb\/s|2\.5"?|up\s*to|r:|w:|\d+\s*mb\/s)\b/gi,
      ' ',
    )
    .replace(/(?<![a-z0-9])\d+(\.\d+)?\s*(tb|gb)\b/gi, ' ')
    .replace(/[^a-z0-9+\-\s]/gi, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !/^\d+$/.test(t))
    .filter((t, i, all) => i === 0 || t.toLowerCase() !== all[i - 1].toLowerCase())
    .slice(0, 3)

  return {
    category: 'storage',
    partId: slug([brand ?? 'generic', modelTokens.join('-'), label, storageInterface].filter(Boolean).join('-')),
    brand: brand ? brand.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unbranded',
    model: [modelTokens.join(' '), label].filter(Boolean).join(' ').trim(),
    capacityGb,
    storageInterface,
  }
}

// ---------------------------------------------------------------------------
// Case

const CASE_BRANDS = [
  'nzxt', 'corsair', 'lian li', 'fractal', 'cooler master', 'coolermaster',
  'thermaltake', 'antec', 'asus', 'msi', 'gigabyte', 'deepcool', 'segotep',
  'gamdias', 'raidmax', 'darkflash', 'dark flash', 'cougar', 'aerocool',
  'phanteks', 'be quiet', 'montech', 'arctic', 'xigmatek', 'ant esports',
  'gamemax', 'tian', 'zalman',
]

/** Filed under cases but not a case. */
const NOT_A_CASE =
  /\b(stand\s*kit|bracket|panel|riser|fan\s*kit|filter|handle|wheel|accessor|cable|mini\s*pc|barebone|lcd|kit\s*for|screws?)\b/i

/**
 * Cases.
 *
 * `formFactor` records the LARGEST board the case accepts, so one value plus an
 * ordering answers the fit question — a case that takes ATX also takes mATX and
 * ITX. Tower class is the signal: full and mid towers are ATX, micro towers are
 * mATX. Where a title says nothing it stays null and the check reports unknown
 * rather than assuming the roomier answer, which would be the unsafe direction.
 */
export function extractCase(rawTitle: string): CaseIdentity | null {
  const title = stripAsides(rawTitle)
  // The shop already filed this under cases, so the job is rejecting the
  // accessories that share the shelf — not demanding the word "case". Plenty of
  // real ones are listed as "COUGAR GEMINI S IRON GRAY RGB GAMING".
  if (NOT_A_CASE.test(title)) return null

  const formFactor: CaseIdentity['formFactor'] = /\bmini[\s-]*itx\b|\bitx\b/i.test(title)
    ? 'ITX'
    : /\bmicro\b|\bm-?atx\b|\bmatx\b/i.test(title)
      ? 'mATX'
      : /\bfull[\s-]*(tower|atx)?\b|\bmid[\s-]*tower\b|\batx\b|\bе?-?atx\b/i.test(title)
        ? 'ATX'
        : null

  const brand = findBrand(title, CASE_BRANDS)

  const modelTokens = title
    .replace(brand ? new RegExp(`\\b${brand.replace(/\s/g, '\\s*')}\\b`, 'gi') : /(?!)/g, ' ')
    .replace(
      /\b(case|casing|chassis|gaming|mid|full|micro|mini|tower|atx|matx|itx|argb|rgb|with|fans?|tempered|glass|tg|black|white|grey|gray|edition)\b/gi,
      ' ',
    )
    .replace(/[^a-z0-9+\-\s]/gi, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    // Numbers are kept here, unlike elsewhere: a case model is frequently just
    // one — A290, VX320, "Tower 600" — and dropping it leaves "The".
    .filter((t) => t.length > 1)
    .filter((t, i, all) => i === 0 || t.toLowerCase() !== all[i - 1].toLowerCase())
    .slice(0, 3)

  if (!brand && modelTokens.length === 0) return null

  return {
    category: 'case',
    partId: slug([brand ?? 'generic', modelTokens.join('-'), formFactor].filter(Boolean).join('-')),
    brand: brand ? brand.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unbranded',
    model: [modelTokens.join(' '), formFactor].filter(Boolean).join(' ').trim() || 'Case',
    formFactor,
  }
}

// Peripherals

/**
 * The only brands this category carries, as [title pattern, display name].
 *
 * Shops' keyboard and mouse shelves are mostly budget and unbranded lines; the
 * category is for the names a buyer compares across shops, so anything else is
 * dropped rather than listed. DualSense and DualShock stand in for Sony, whose
 * name many listings leave out.
 */
const PERIPHERAL_BRANDS: [string, string][] = [
  // "Logitech G" is the gaming line's name, not part of a model: "Logitech G
  // Pro X" and "Logitech PRO X" are the same mouse.
  ['logitech(?:\\s*g\\b)?', 'Logitech'],
  ['razer', 'Razer'],
  ['corsair', 'Corsair'],
  ['steel\\s*series', 'SteelSeries'],
  ['hyper\\s*x', 'HyperX'],
  ['asus', 'ASUS'],
  // Matched without being consumed, so "ROG Harpe" and "ASUS ROG Harpe" keep
  // ROG in the model and land on one id.
  ['(?=rog\\b)', 'ASUS'],
  ['glorious', 'Glorious'],
  ['(?:benq\\s*)?zowie', 'Zowie'],
  ['cooler\\s*master', 'Cooler Master'],
  ['msi', 'MSI'],
  ['(?:microsoft\\s*)?xbox', 'Xbox'],
  ['(?:sony\\s*)?(?:playstation|ps5|ps4)', 'PlayStation'],
  ['(?:sony\\s*)?(?=dual\\s*(?:sense|shock))', 'PlayStation'],
  ['8\\s*bit\\s*do', '8BitDo'],
]

/**
 * The brand, but only where the title starts with it.
 *
 * Gamepads are sold "for PC / Xbox / PS4", and wheels "for Logitech G29", so a
 * brand anywhere in the title would file a no-name controller under Xbox.
 * Every real listing seen leads with the maker.
 */
function peripheralBrand(title: string): { name: string; length: number } | null {
  for (const [pattern, name] of PERIPHERAL_BRANDS) {
    const m = title.match(new RegExp(`^\\s*${pattern}\\b`, 'i'))
    if (m) return { name, length: m[0].length }
  }
  return null
}

/**
 * Shelf-mates that are not a keyboard, mouse or gamepad. Combos are left out
 * too: a keyboard-and-mouse set is a third product, priced against neither.
 */
const NOT_A_PERIPHERAL = new RegExp(
  [
    'combo', 'keyboard\\s*(?:&|and|\\+|/)\\s*mouse', 'mouse\\s*(?:&|and|\\+|/)\\s*keyboard',
    'mouse\\s*-?\\s*pad', 'mouse\\s*mat', 'desk\\s*(?:pad|mat)', 'mat',
    'racing', 'steering', 'driving\\s*force', 'pedals?', 'shifter', 'grips?', 'bungee', 'keycaps?',
    'wrist', 'skates?', 'feet', 'switches', 'headset', 'headphones?', 'webcam',
    'microphone', 'stand', 'holder', 'mount', 'cover', 'skin', 'pouch',
    'carry(?:ing)?\\s*case', 'charging\\s*(?:dock|station)', 'replacement', 'cable',
  ]
    .map((p) => `\\b${p}\\b`)
    .join('|'),
  'i',
)

/** A receiver or adapter sold on its own, not one bundled "with" a mouse. */
const LONE_ACCESSORY = /^(?!.*\bwith\b).*\b(receiver|dongle|adapter)\b/i

const PERIPHERAL_TYPES: [PeripheralIdentity['peripheralType'], RegExp][] = [
  ['gamepad', /\b(gam(?:e|ing)\s*pad|controllers?|joystick|dual\s*(?:sense|shock))\b/i],
  // Loose at the joins on purpose: nanotek's shelf is the slug
  // "keyboardmouse-gamepad-controller", which must read as all three types
  // (so no hint at all), not as gamepad alone.
  ['keyboard', /\bkey(?:board|pad)s?/i],
  ['mouse', /(?:\b|board)(?:mouse|mice)\b/i],
]

/** The one type a text names, or null for none or more than one. */
function peripheralType(text: string): PeripheralIdentity['peripheralType'] | null {
  const found = PERIPHERAL_TYPES.filter(([, re]) => re.test(text))
  return found.length === 1 ? found[0][0] : null
}

const WIRELESS =
  /\b(wireless|bluetooth|lightspeed|hyperspeed|slipstream|2\.4\s*g(?:hz)?|tri[\s-]*mode|dual[\s-]*mode|dual\s*(?:sense|shock))\b/i

/** Product names that only come wireless. */
const NAMED_RADIO = /\b(lightspeed|hyperspeed|slipstream|dual\s*(?:sense|shock))\b/i

/** Whole words only: "black" must not take the front off "BlackWidow". */
const PERIPHERAL_NOISE = new RegExp(
  `(?<![a-z0-9])(?:${[
    'gam(?:e|ing)\\s*pad', 'gaming', 'mouse', 'mice', 'keyboard', 'controller', 'wired',
    // "mechani\w*" because shops also spell it "Mechanichal".
    'bluetooth', 'usb(?:[\\s-]*c)?', 'a?rgb', 'lightsync', 'mechani\\w*', 'membrane', 'optical',
    'ergonomic', 'ultra[\\s-]*light(?:weight)?', 'lightweight', 'backlit', 'e-?sports?',
    'high[\\s-]*perf\\w*',
    'black', 'white', 'pink', 'gr[ae]y', 'lilac', 'mercury', 'midnight', 'edition',
    'red|blue|brown|green|yellow|orange|purple|silver', 'linear|tactile|clicky',
    'switch', 'for', 'with', 'and', 'the', 'new', 'pc', 'mac', 'windows',
    '\\d+(?:\\.\\d+)?\\s*k?\\s*dpi', '2\\.4\\s*g(?:hz)?', '\\d+\\s*%',
    'microsoft', 'sony', 'playstation', 'ps5', 'ps4',
  ].join('|')})(?![a-z0-9])`,
  'gi',
)

const PERIPHERAL_NOUN: Record<PeripheralIdentity['peripheralType'], string> = {
  keyboard: 'Keyboard',
  mouse: 'Mouse',
  gamepad: 'Controller',
}

/**
 * Keyboards, mice and gamepads from the major brands.
 *
 * The type comes from the title, falling back to the shop's own sub-category
 * (`retailerCategory`) for titles like "Razer Viper V3 Pro" that never say
 * "mouse". Colour and switch variants share an id: they sell at one price, and
 * splitting them would scatter a model's offers across several pages.
 */
export function extractPeripheral(
  rawTitle: string,
  retailerCategory = '',
): PeripheralIdentity | null {
  if (NOT_A_PERIPHERAL.test(rawTitle) || LONE_ACCESSORY.test(rawTitle)) return null

  const brand = peripheralBrand(rawTitle)
  if (!brand) return null

  // The last segment of a path like "Mouse, Keyboard & Combo > Mouse" names
  // this product, where the parent names its whole shelf. When the last one
  // says nothing ("Peripherals / Mouse / Office Wireless"), the whole path can.
  const shelf = retailerCategory.split(/[>/]/).at(-1) ?? ''
  const type =
    peripheralType(rawTitle) ?? peripheralType(shelf) ?? peripheralType(retailerCategory)
  if (!type) return null

  // Sales copy after a comma or a spaced dash ("…, 25K DPI sensor") is not
  // the model name.
  const name = stripAsides(rawTitle.slice(brand.length)).split(/,|\s[-–|]\s/)[0]
  const modelTokens = name
    .replace(PERIPHERAL_NOISE, ' ')
    .replace(/[^a-z0-9+\-\s]/gi, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 0)
    // ASUS part codes: "P309 TUF M3" is the "TUF M3" another shop lists.
    .filter((t) => !(brand.name === 'ASUS' && /^(p\d{3}|ra\d{2})$/i.test(t)))
    .filter((t, i, all) => i === 0 || t.toLowerCase() !== all[i - 1].toLowerCase())
    // "Wireless" stays in the model unless a named radio already says so. A
    // Corsair "Katar Pro" is Rs 8,000 wired and Rs 18,000 wireless, so merging
    // them would show the wired price for both. "G304 Lightspeed" needs no
    // "Wireless" to tell it apart.
    .filter((t) => !(/^wireless$/i.test(t) && NAMED_RADIO.test(rawTitle)))
    // Five, because "Pro X Superlight 2" is not "Pro X Superlight".
    .slice(0, 5)

  const wireless = WIRELESS.test(rawTitle)
  const model = modelTokens.some((t) => !/^wireless$/i.test(t))
    ? modelTokens.join(' ')
    : `${wireless ? 'Wireless ' : ''}${PERIPHERAL_NOUN[type]}`

  return {
    category: 'peripherals',
    partId: slug(`${brand.name} ${model}`),
    brand: brand.name,
    model,
    peripheralType: type,
    wireless,
  }
}

// Laptops

/**
 * Major laptop brands, as [title pattern, display name]. The lookaheads match
 * a title that leads with the series alone ("ThinkPad X1 Carbon", "MacBook
 * Air") without eating the series name.
 */
const LAPTOP_BRANDS: [string, string][] = [
  ['lenovo', 'Lenovo'],
  ['(?=(?:thinkpad|thinkbook|ideapad|legion|loq|yoga)\\b)', 'Lenovo'],
  ['hp', 'HP'],
  ['(?=(?:omen|victus|pavilion|elitebook|probook|omnibook)\\b)', 'HP'],
  ['dell', 'Dell'],
  ['(?=(?:latitude|inspiron|vostro|xps|alienware)\\b)', 'Dell'],
  ['asus', 'ASUS'],
  ['(?=(?:rog|tuf|vivobook|zenbook|expertbook)\\b)', 'ASUS'],
  ['acer', 'Acer'],
  ['(?=(?:nitro|predator|aspire|swift)\\b)', 'Acer'],
  ['msi', 'MSI'],
  ['apple', 'Apple'],
  ['(?=macbook\\b)', 'Apple'],
  ['gigabyte', 'Gigabyte'],
  ['(?=aorus\\b)', 'Gigabyte'],
  ['samsung', 'Samsung'],
  ['(?:microsoft\\s*)?(?=surface\\b)', 'Microsoft'],
]

function leadingBrand(title: string, brands: [string, string][]): { name: string; length: number } | null {
  for (const [pattern, name] of brands) {
    const m = title.match(new RegExp(`^\\s*${pattern}\\b`, 'i'))
    if (m) return { name, length: m[0].length }
  }
  return null
}

/**
 * Not a new laptop. Used and refurbished machines are dropped for the same
 * reason used parts are: a lower price for a different condition would win
 * every comparison, with nothing on the row to say why. Apple's shelf also
 * carries desktops.
 */
const NOT_A_NEW_LAPTOP =
  /\b(used|refurb(?:ished)?|pre[\s-]*owned|open[\s-]*box|ex[\s-]*uk|mac\s*mini|imac|mac\s*studio|ipad)\b/i

/**
 * The processor, as precisely as the text allows. Every laptop listing names
 * one, and no bag, stand or memory stick does, so a miss here is also how
 * accessories on the shelf are dropped.
 */
export function laptopCpu(text: string): string | null {
  // "Ryzen™ 3" and "Core™️ Ultra 9": the mark sits between the words.
  const t = text.replace(/[–—]/g, '-').replace(/[™®️]/g, '')
  let m = t.match(/\bm([1-6])(\s*(?:pro|max|ultra))?(?![a-z0-9])/i)
  if (m && /\b(apple|macbook)\b/i.test(t)) {
    return `Apple M${m[1]}${m[2] ? ` ${m[2].trim()[0].toUpperCase()}${m[2].trim().slice(1).toLowerCase()}` : ''}`
  }
  m = t.match(/\bultr[ae]\s*(x)?\s*([579])(?:\s*-?\s*(\d{3}[a-z]{0,2}))?(?![a-z0-9])/i)
  if (m) return `Core Ultra ${m[1] ? 'X' : ''}${m[2]}${m[3] ? ` ${m[3].toUpperCase()}` : ''}`
  // `i` glued to a SKU ("B1503CVA-I716512G5D") must not read as an i7: the
  // number has to end cleanly.
  m = t.match(/\bi([3579])(?:\s*-?\s*(\d{4,5}[a-z]{0,2}|n\d{3}))?(?![a-z0-9])/i)
  if (m) return `Core i${m[1]}${m[2] ? `-${m[2].toUpperCase()}` : ''}`
  m = t.match(/\b(celeron|pentium)(?:\s*(?:silver\s*)?(n?\d{4}))?/i)
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}${m[2] ? ` ${m[2].toUpperCase()}` : ''}`
  m = t.match(/\bcore\s*([357])(?:\s*-?\s*(\d{3}[a-z]?))?(?![a-z0-9])/i)
  if (m) return `Core ${m[1]}${m[2] ? ` ${m[2].toUpperCase()}` : ''}`
  m = t.match(/\bryzen\s*(ai\s*)?r?([3579])(?:\s*(?:pro\s*)?-?\s*(\d{3,4}[a-z]{0,2}))?(?![a-z0-9])/i)
  if (m) return `Ryzen ${m[1] ? 'AI ' : ''}${m[2]}${m[3] ? ` ${m[3].toUpperCase()}` : ''}`
  // "AMD R3 7320U": Ryzen with the word left out, so the number is required.
  m = t.match(/\br([3579])\s*-?\s*(\d{4}[a-z]{1,2})(?![a-z0-9])/i)
  if (m) return `Ryzen ${m[1]} ${m[2].toUpperCase()}`
  m = t.match(/\bsnapdragon\s*x\s*(elite|plus)?/i)
  if (m) return `Snapdragon X${m[1] ? ` ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}` : ''}`
  return null
}

/**
 * "RTX 4060", "RTX 5070 Ti", "RX 7600S", or "Integrated" where the listing
 * names a built-in GPU. Null when it says nothing: an ASUS TUF A15 listed
 * without its RTX 2050 is not an integrated-graphics laptop.
 */
export function laptopGpu(text: string): string | null {
  let m = text.match(/\b(?:geforce\s*)?(rtx|gtx)\s*(\d{4})(\s*ti)?(?![0-9])/i)
  if (m) return `${m[1].toUpperCase()} ${m[2]}${m[3] ? ' Ti' : ''}`
  m = text.match(/\brx\s*(\d{4})([ms])?(?![0-9])/i)
  if (m) return `RX ${m[1]}${m[2] ? m[2].toUpperCase() : ''}`
  if (/\b(?:uhd|iris|arc|radeon|intel)\s*(?:xe\s*)?graphics\b|\bintegrated\b|\bapple\s*m\d\b|\bmacbook\b/i.test(text)) {
    return 'Integrated'
  }
  return null
}

const toGb = (n: string, unit: string) => Number(n) * (/t/i.test(unit) ? 1000 : 1)

/** System memory: "16GB DDR5", "32GB RAM", "16GB unified". Never "8GB GDDR6". */
function laptopMemory(text: string): number | null {
  const m =
    text.match(/(?<![0-9])(\d{1,3})\s*gb\s*(?:of\s*)?(?:ram|ddr\d|lpddr\w*|unified|memory)/i) ??
    text.match(/(?<![a-z])(?:ddr\d|ram)\s*(\d{1,3})\s*gb/i)
  if (m) return Number(m[1])
  // A separated title with "| 16GB |" or "/ 16GB /" and nothing else in the cell.
  // Two digits at most, so the "512GB" cell of "8GB/512GB" is not memory.
  const cell = text.split(/[|/]/).find((c) => /^\s*(\d{1,2})\s*gb\s*$/i.test(c))
  if (cell) return Number(cell.match(/\d+/)![0])
  // Apple style, "16GB 512GB": memory, then storage.
  const pair = text.match(/(?<![0-9])(\d{1,2})\s*gb\s*[/,]?\s*(?:\d{3,4}\s*gb|\d\s*tb)/i)
  return pair ? Number(pair[1]) : null
}

/** Storage: "512GB NVMe", "1TB SSD", "512 NVME SSD", "256GB UFS". */
function laptopStorage(text: string): number | null {
  const m = text.match(
    /(?<![0-9])(\d{1,4})\s*(gb|tb)?\s*(?:gen\s*\d\s*)?(?:pcie\s*)?(?:m\.2\s*)?(?:nvme|ssd|hdd|ufs|emmc|storage|m\.2)/i,
  )
  if (m && (m[2] || ['128', '256', '512'].includes(m[1]))) return toGb(m[1], m[2] ?? 'gb')
  const pair = text.match(/(?<![0-9])\d{1,2}\s*gb\s*[/,]?\s*(\d{3,4})\s*(gb|tb)|(?<![0-9])\d{1,2}\s*gb\s*[/,]?\s*(\d)\s*(tb)/i)
  return pair ? toGb(pair[1] ?? pair[3], pair[2] ?? pair[4]) : null
}

function laptopScreen(text: string): number | null {
  const m = text.match(/(?<![0-9.])(1[0-8](?:\.\d)?)\s*(?:"|''|”|″|’’|'|-?\s*inch)/i)
  return m ? Number(m[1]) : null
}

/**
 * The maker's full part number, which fixes the whole configuration:
 * ASUS "FA506NCG-HN332WS", MSI "A13UDX 2407XLK", HP "15-FA2013DX", Lenovo's
 * machine type "83FD05TLK", Acer "ANV15-52-9161". A bare model code such as
 * "G615JPR" is not one: the same code ships with different memory.
 */
const MAKER_CODES = [
  /\b([a-z]{1,4}\d{1,4}[a-z]{1,6}\d?)[\s-]([a-z]{1,3}\d{2,}[a-z0-9]*(?:-[a-z0-9]{2,4})?|\d{3,4}[a-z]{2,4})\b/i,
  /\b(\d{2}-[a-z]{2}\d{4}[a-z]{2,3})\b/i,
  /\b(8\d[a-z]{2}\d{2}[a-z0-9]{2,4})\b/i,
  /\b([a-z]{2,3}\d{2}-\d{2}-[a-z0-9]{4})\b/i,
]

function makerCode(title: string): string | null {
  for (const re of MAKER_CODES) {
    const m = title.match(re)
    if (m) return m.slice(1).filter(Boolean).join('-').toUpperCase()
  }
  return null
}

const LAPTOP_NOISE = new RegExp(
  `(?<![a-z0-9])(?:${[
    'laptop', 'notebook', 'gaming', 'intel', 'amd', 'processor', 'series', 'edition',
    'black', 'white', 'silver', 'gr[ae]y', 'blue', 'green', 'gold', 'new', '\\d{4}',
    'oled', 'touch', 'fhd', 'qhd', 'wuxga', 'wqxga', 'ai\\+?',
  ].join('|')})(?![a-z0-9])`,
  'gi',
)

const LAPTOP_ACRONYMS = /^(tuf|rog|loq|xps|hx|oled|duo)$/i

/** Where the name ends and the specs begin: the processor, a pipe or a comma. */
const SPEC_START =
  /\||,|\s[-–]\s|\b(?:intel|amd|apple\s*m\d|core|ryzen|ultr[ae]|i[3579](?![a-z0-9])|m[1-6](?![a-z0-9])|snapdragon|\d{1,2}(?:\.\d)?\s*(?:"|''|”|″|inch))/i

/**
 * Laptops from the major brands.
 *
 * Two listings are the same laptop when the maker's part number matches, or
 * failing that when brand, series, processor, graphics, memory and storage
 * all match. A listing with neither is dropped: comparing a 16GB machine's
 * price with an 8GB one's is a wrong answer, and the model name alone does
 * not tell them apart.
 *
 * `specs` is the shop's own spec table, used where the title leaves a value
 * out (winsoft lists CPU, GPU and screen there).
 */
export function extractLaptop(
  rawTitle: string,
  specs: Record<string, string> = {},
): LaptopIdentity | null {
  // Shops paste codes with non-breaking and figure dashes: "G615JPR‑S5035WS".
  rawTitle = rawTitle.replace(/[‐‑‒–—]/g, '-')
  if (NOT_A_NEW_LAPTOP.test(rawTitle)) return null
  const brand = leadingBrand(rawTitle, LAPTOP_BRANDS)
  if (!brand) return null

  const spec = (re: RegExp) =>
    Object.entries(specs).find(([k]) => re.test(k))?.[1] ?? ''
  const cpuModel = laptopCpu(rawTitle) ?? laptopCpu(spec(/processor|cpu/i))
  const gpuModel = laptopGpu(rawTitle) ?? laptopGpu(spec(/gpu|graphic/i))
  const memoryGb = laptopMemory(rawTitle) ?? laptopMemory(`${spec(/ram|memory/i)} ram`)
  const storageGb = laptopStorage(rawTitle) ?? laptopStorage(`${spec(/storage|ssd|hdd/i)} ssd`)
  const screenInches = laptopScreen(rawTitle) ?? laptopScreen(`${spec(/screen|display/i)}"`)

  const rest = stripAsides(rawTitle.slice(brand.length))
  const name = rest.slice(0, rest.search(SPEC_START) === -1 ? undefined : rest.search(SPEC_START))
  // The code can sit after the name: "TUF Gaming A15, FA506NCG-HN332WS, …".
  const code = makerCode(rest)
  // A processor or a maker code is what tells a laptop from the brackets,
  // bags and memory sticks that share its shelf.
  if (!cpuModel && !code) return null
  const seriesTokens = name
    .replace(code ? new RegExp(code.replace(/-/g, '[\\s-]'), 'i') : /(?!)/, ' ')
    .replace(LAPTOP_NOISE, ' ')
    .replace(/[^a-z0-9+\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
  const series = seriesTokens
    .map((t) =>
      /\d/.test(t) || LAPTOP_ACRONYMS.test(t) ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1).toLowerCase(),
    )
    .join(' ')

  let partId: string
  if (code) {
    partId = slug(`${brand.name} ${code}`)
  } else if (cpuModel && memoryGb && storageGb && series) {
    partId = slug(
      [brand.name, series, cpuModel, gpuModel ?? '', `${memoryGb}gb`, `${storageGb}gb`].join(' '),
    )
  } else {
    return null
  }

  return {
    category: 'laptops',
    partId,
    brand: brand.name,
    model: series || code || cpuModel || 'Laptop',
    cpuModel,
    gpuModel,
    memoryGb,
    storageGb,
    screenInches,
    makerCode: code,
  }
}

// Consoles and handhelds

/** Shelf-mates: controllers, headsets, stands, wheels and games. */
const NOT_A_CONSOLE =
  /\b(controller|dual\s*-?\s*sense|dualshock|headset|stand|cooling|charging|charger|station|camera|cover|skin|bag|case|remote|wheel|pedals?|shifter|monitor|games?|grip|cable|adapter|dock|edge|joy-?con)\b/i

type ConsoleMatch = Omit<ConsoleIdentity, 'category' | 'partId'>

const capacity = (t: string) => {
  const m = t.match(/(?<![0-9])(\d{3,4}\s*gb|\d\s*tb)(?![a-z])/i)
  return m ? m[1].replace(/\s+/g, '').toUpperCase() : null
}

function consoleModel(t: string): ConsoleMatch | null {
  if (/playstation\s*portal/i.test(t)) {
    return { brand: 'Sony', model: 'PlayStation Portal', consoleType: 'handheld', platform: 'PlayStation' }
  }
  if (/\b(?:playstation\s*5|ps\s*5)\b/i.test(t)) {
    const pro = /\bpro\b/i.test(t)
    const parts = [
      'PlayStation 5',
      pro && 'Pro',
      !pro && /\bslim\b/i.test(t) && 'Slim',
      !pro && (/\bdigital\b/i.test(t) ? 'Digital' : /\bdis[ck]\b/i.test(t) ? 'Disc' : null),
      // A Pro only ever ships with 2TB, so saying so does not make another one.
      !pro && capacity(t),
    ]
    return { brand: 'Sony', model: parts.filter(Boolean).join(' '), consoleType: 'console', platform: 'PlayStation' }
  }
  let m = t.match(/\bxbox\s*series\s*([xs])\b/i)
  if (m) {
    const parts = [`Xbox Series ${m[1].toUpperCase()}`, /\bdigital\b/i.test(t) && 'Digital', capacity(t)]
    return { brand: 'Microsoft', model: parts.filter(Boolean).join(' '), consoleType: 'console', platform: 'Xbox' }
  }
  m = t.match(/\bswitch\s*[-–]?\s*(2|oled|lite)?\b/i)
  if (m && /\bnintendo\b/i.test(t)) {
    const variant = m[1] ? (m[1] === '2' ? '2' : m[1].toUpperCase() === 'OLED' ? 'OLED' : 'Lite') : null
    return { brand: 'Nintendo', model: ['Nintendo Switch', variant].filter(Boolean).join(' '), consoleType: 'handheld', platform: 'Nintendo' }
  }
  // Valve's console, not a Steam Deck, though tecroot lists it as "Steam Deck
  // Steam Machine".
  if (/\bsteam\s*machine\b/i.test(t)) {
    return { brand: 'Valve', model: 'Steam Machine', consoleType: 'console', platform: 'SteamOS' }
  }
  if (/\bsteam\s*deck\b/i.test(t)) {
    const parts = ['Steam Deck', /\boled\b/i.test(t) && 'OLED', capacity(t)]
    return { brand: 'Valve', model: parts.filter(Boolean).join(' '), consoleType: 'handheld', platform: 'SteamOS' }
  }
  if (/\brog\s*(?:xbox\s*)?ally\b/i.test(t)) {
    const parts = ['ROG', /\bxbox\b/i.test(t) && 'Xbox', 'Ally', /\bally\s*x\b/i.test(t) && 'X']
    return { brand: 'ASUS', model: parts.filter(Boolean).join(' '), consoleType: 'handheld', platform: 'Windows' }
  }
  m = t.match(/\blegion\s*go\s*(s|2)?\b/i)
  if (m) {
    return { brand: 'Lenovo', model: ['Legion Go', m[1]?.toUpperCase()].filter(Boolean).join(' '), consoleType: 'handheld', platform: 'Windows' }
  }
  m = t.match(/\bclaw\b\s*-?\s*(a\d+m?|\d\s*ai\+?)?/i)
  if (m && /\bmsi\b/i.test(t)) {
    return { brand: 'MSI', model: ['Claw', m[1]?.toUpperCase().replace(/\s+/g, ' ')].filter(Boolean).join(' '), consoleType: 'handheld', platform: 'Windows' }
  }
  return null
}

/**
 * Game consoles and handheld gaming PCs. Each is a short, fixed list of
 * models, so the name is rebuilt from what the title says ("PlayStation 5" +
 * Slim + Disc + 1TB) rather than cleaned up from it, and word order or "PS5"
 * versus "PlayStation 5" cannot split one console into two.
 */
export function extractConsole(rawTitle: string): ConsoleIdentity | null {
  if (NOT_A_CONSOLE.test(rawTitle)) return null
  // Brackets are kept, not stripped as elsewhere: "(Slim)" names the model.
  const found = consoleModel(rawTitle.replace(/[()[\]]/g, ' '))
  if (!found) return null
  // A console sold with a game is its own product. Merged with the plain
  // console, a bundle's price would be compared against one without the game.
  if (/\bbundle\b|\s\+\s/i.test(rawTitle)) found.model += ' Bundle'
  return { category: 'consoles', partId: slug(found.model), ...found }
}

/** Extract using the category the retailer claimed, returning null if it disagrees. */
export function extractIdentity(
  category: string,
  rawTitle: string,
  retailerCategory?: string,
  specs?: Record<string, string>,
): Identity | null {
  if (category === 'gpu') return extractGpu(rawTitle)
  if (category === 'psu') return extractPsu(rawTitle)
  if (category === 'cpu') return extractCpu(rawTitle)
  if (category === 'motherboard') return extractMotherboard(rawTitle)
  if (category === 'ram') return extractRam(rawTitle)
  if (category === 'storage') return extractStorage(rawTitle)
  if (category === 'case') return extractCase(rawTitle)
  if (category === 'peripherals') return extractPeripheral(rawTitle, retailerCategory)
  if (category === 'laptops') return extractLaptop(rawTitle, specs)
  if (category === 'consoles') return extractConsole(rawTitle)
  return null
}
