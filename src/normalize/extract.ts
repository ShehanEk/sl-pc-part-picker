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

export type Identity = GpuIdentity | PsuIdentity

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

/** Extract using the category the retailer claimed, returning null if it disagrees. */
export function extractIdentity(
  category: string,
  rawTitle: string,
): Identity | null {
  if (category === 'gpu') return extractGpu(rawTitle)
  if (category === 'psu') return extractPsu(rawTitle)
  return null
}
