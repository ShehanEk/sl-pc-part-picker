/**
 * Curated processor power draw.
 *
 * Sockets need no curation — they follow from the model number, which is what
 * platforms.ts exploits. Power draw does not: it ranges from 35W to 170W within
 * a single generation, never appears in a listing, and feeds the one rule where
 * being wrong means a machine that shuts down under load rather than a poor
 * recommendation.
 *
 * Without this every processor in a build was assumed to draw 95W. A Ryzen 9
 * 7950X draws 170W, which with the headroom multiplier understated the supply
 * by roughly 100W.
 *
 * Values are the manufacturer's base TDP, read from the tables cited below.
 * Where a part lists a range, the base figure is taken; boost behaviour is a
 * motherboard setting rather than a property of the chip, and the headroom in
 * the PSU rule is what covers it.
 */

/** https://en.wikipedia.org/wiki/List_of_AMD_Ryzen_processors */
const AMD_LIST = 'https://en.wikipedia.org/wiki/List_of_AMD_Ryzen_processors'
/** https://en.wikipedia.org/wiki/List_of_Intel_Core_processors */
const INTEL_LIST = 'https://en.wikipedia.org/wiki/List_of_Intel_Core_processors'

export type CuratedCpu = {
  partId: string
  tdpWatts: number
  source: string
}

export const CURATED_CPUS: CuratedCpu[] = [
  { partId: 'intel-core-ultra-5-225', tdpWatts: 65, source: INTEL_LIST }, // Core Ultra 5 225
  { partId: 'intel-core-ultra-5-225f', tdpWatts: 65, source: INTEL_LIST }, // Core Ultra 5 225F
  { partId: 'intel-core-ultra-5-235', tdpWatts: 65, source: INTEL_LIST }, // Core Ultra 5 235
  { partId: 'intel-core-ultra-5-245k', tdpWatts: 125, source: INTEL_LIST }, // Core Ultra 5 245K
  { partId: 'intel-core-ultra-7-265k', tdpWatts: 125, source: INTEL_LIST }, // Core Ultra 7 265K
  { partId: 'intel-core-ultra-9-285k', tdpWatts: 125, source: INTEL_LIST }, // Core Ultra 9 285K
  { partId: 'intel-core-i3-10100', tdpWatts: 65, source: INTEL_LIST }, // Core i3-10100
  { partId: 'intel-core-i3-10100f', tdpWatts: 65, source: INTEL_LIST }, // Core i3-10100F
  { partId: 'intel-core-i3-10105', tdpWatts: 65, source: INTEL_LIST }, // Core i3-10105
  { partId: 'intel-core-i3-12100', tdpWatts: 60, source: INTEL_LIST }, // Core i3-12100
  { partId: 'intel-core-i3-12100f', tdpWatts: 58, source: INTEL_LIST }, // Core i3-12100F
  { partId: 'intel-core-i3-13100', tdpWatts: 60, source: INTEL_LIST }, // Core i3-13100
  { partId: 'intel-core-i3-14100', tdpWatts: 60, source: INTEL_LIST }, // Core i3-14100
  { partId: 'intel-core-i5-10400', tdpWatts: 65, source: INTEL_LIST }, // Core i5-10400
  { partId: 'intel-core-i5-10400f', tdpWatts: 65, source: INTEL_LIST }, // Core i5-10400F
  { partId: 'intel-core-i5-11400', tdpWatts: 65, source: INTEL_LIST }, // Core i5-11400
  { partId: 'intel-core-i5-11400f', tdpWatts: 65, source: INTEL_LIST }, // Core i5-11400F
  { partId: 'intel-core-i5-12400', tdpWatts: 65, source: INTEL_LIST }, // Core i5-12400
  { partId: 'intel-core-i5-12400f', tdpWatts: 65, source: INTEL_LIST }, // Core i5-12400F
  { partId: 'intel-core-i5-12600k', tdpWatts: 125, source: INTEL_LIST }, // Core i5-12600K
  { partId: 'intel-core-i5-13400', tdpWatts: 65, source: INTEL_LIST }, // Core i5-13400
  { partId: 'intel-core-i5-13400f', tdpWatts: 65, source: INTEL_LIST }, // Core i5-13400F
  { partId: 'intel-core-i5-13600k', tdpWatts: 125, source: INTEL_LIST }, // Core i5-13600K
  { partId: 'intel-core-i5-13600kf', tdpWatts: 125, source: INTEL_LIST }, // Core i5-13600KF
  { partId: 'intel-core-i5-14400', tdpWatts: 65, source: INTEL_LIST }, // Core i5-14400
  { partId: 'intel-core-i5-14400f', tdpWatts: 65, source: INTEL_LIST }, // Core i5-14400F
  { partId: 'intel-core-i5-14400t', tdpWatts: 35, source: INTEL_LIST }, // Core i5-14400T
  { partId: 'intel-core-i5-14600k', tdpWatts: 125, source: INTEL_LIST }, // Core i5-14600K
  { partId: 'intel-core-i7-10700', tdpWatts: 65, source: INTEL_LIST }, // Core i7-10700
  { partId: 'intel-core-i7-11700', tdpWatts: 65, source: INTEL_LIST }, // Core i7-11700
  { partId: 'intel-core-i7-11700f', tdpWatts: 65, source: INTEL_LIST }, // Core i7-11700F
  { partId: 'intel-core-i7-12700', tdpWatts: 65, source: INTEL_LIST }, // Core i7-12700
  { partId: 'intel-core-i7-12700f', tdpWatts: 65, source: INTEL_LIST }, // Core i7-12700F
  { partId: 'intel-core-i7-12700k', tdpWatts: 125, source: INTEL_LIST }, // Core i7-12700K
  { partId: 'intel-core-i7-13700', tdpWatts: 65, source: INTEL_LIST }, // Core i7-13700
  { partId: 'intel-core-i7-13700f', tdpWatts: 65, source: INTEL_LIST }, // Core i7-13700F
  { partId: 'intel-core-i7-13700k', tdpWatts: 125, source: INTEL_LIST }, // Core i7-13700K
  { partId: 'intel-core-i7-13700kf', tdpWatts: 125, source: INTEL_LIST }, // Core i7-13700KF
  { partId: 'intel-core-i7-14700', tdpWatts: 65, source: INTEL_LIST }, // Core i7-14700
  { partId: 'intel-core-i7-14700f', tdpWatts: 65, source: INTEL_LIST }, // Core i7-14700F
  { partId: 'intel-core-i7-14700k', tdpWatts: 125, source: INTEL_LIST }, // Core i7-14700K
  { partId: 'intel-core-i9-12900k', tdpWatts: 125, source: INTEL_LIST }, // Core i9-12900K
  { partId: 'intel-core-i9-13900k', tdpWatts: 125, source: INTEL_LIST }, // Core i9-13900K
  { partId: 'intel-core-i9-13900kf', tdpWatts: 125, source: INTEL_LIST }, // Core i9-13900KF
  { partId: 'intel-core-i9-14900k', tdpWatts: 125, source: INTEL_LIST }, // Core i9-14900K
  { partId: 'intel-core-i9-14900kf', tdpWatts: 125, source: INTEL_LIST }, // Core i9-14900KF
  { partId: 'intel-core-i9-14900ks', tdpWatts: 150, source: INTEL_LIST }, // Core i9-14900KS
  { partId: 'amd-ryzen-5-3400g', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 3400G
  { partId: 'amd-ryzen-5-3600', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 3600
  { partId: 'amd-ryzen-5-4600g', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 4600G
  { partId: 'amd-ryzen-5-5500', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 5500
  { partId: 'amd-ryzen-5-5500gt', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 5500GT
  { partId: 'amd-ryzen-5-5500x3d', tdpWatts: 105, source: AMD_LIST }, // Ryzen 5 5500X3D
  { partId: 'amd-ryzen-5-5600', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 5600
  { partId: 'amd-ryzen-5-5600g', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 5600G
  { partId: 'amd-ryzen-5-5600gt', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 5600GT
  { partId: 'amd-ryzen-5-5600x', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 5600X
  { partId: 'amd-ryzen-5-7500f', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 7500F
  { partId: 'amd-ryzen-5-7500x3d', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 7500X3D
  { partId: 'amd-ryzen-5-7600', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 7600
  { partId: 'amd-ryzen-5-7600x', tdpWatts: 105, source: AMD_LIST }, // Ryzen 5 7600X
  { partId: 'amd-ryzen-5-8400f', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 8400F
  { partId: 'amd-ryzen-5-8500g', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 8500G
  { partId: 'amd-ryzen-5-8600g', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 8600G
  { partId: 'amd-ryzen-5-9600x', tdpWatts: 65, source: AMD_LIST }, // Ryzen 5 9600X
  { partId: 'amd-ryzen-7-3800x', tdpWatts: 105, source: AMD_LIST }, // Ryzen 7 3800X
  { partId: 'amd-ryzen-7-5700g', tdpWatts: 65, source: AMD_LIST }, // Ryzen 7 5700G
  { partId: 'amd-ryzen-7-5700x', tdpWatts: 65, source: AMD_LIST }, // Ryzen 7 5700X
  { partId: 'amd-ryzen-7-5800x', tdpWatts: 105, source: AMD_LIST }, // Ryzen 7 5800X
  { partId: 'amd-ryzen-7-7700', tdpWatts: 65, source: AMD_LIST }, // Ryzen 7 7700
  { partId: 'amd-ryzen-7-7700x', tdpWatts: 105, source: AMD_LIST }, // Ryzen 7 7700X
  { partId: 'amd-ryzen-7-7800x3d', tdpWatts: 120, source: AMD_LIST }, // Ryzen 7 7800X3D
  { partId: 'amd-ryzen-7-8700g', tdpWatts: 65, source: AMD_LIST }, // Ryzen 7 8700G
  { partId: 'amd-ryzen-7-9700x', tdpWatts: 65, source: AMD_LIST }, // Ryzen 7 9700X
  { partId: 'amd-ryzen-7-9800x3d', tdpWatts: 120, source: AMD_LIST }, // Ryzen 7 9800X3D
  { partId: 'amd-ryzen-7-9850x3d', tdpWatts: 120, source: AMD_LIST }, // Ryzen 7 9850X3D
  { partId: 'amd-ryzen-9-5900x', tdpWatts: 105, source: AMD_LIST }, // Ryzen 9 5900X
  { partId: 'amd-ryzen-9-5950x', tdpWatts: 105, source: AMD_LIST }, // Ryzen 9 5950X
  { partId: 'amd-ryzen-9-7900x', tdpWatts: 170, source: AMD_LIST }, // Ryzen 9 7900X
  { partId: 'amd-ryzen-9-7900x3d', tdpWatts: 120, source: AMD_LIST }, // Ryzen 9 7900X3D
  { partId: 'amd-ryzen-9-7950x', tdpWatts: 170, source: AMD_LIST }, // Ryzen 9 7950X
  { partId: 'amd-ryzen-9-7950x3d', tdpWatts: 120, source: AMD_LIST }, // Ryzen 9 7950X3D
  { partId: 'amd-ryzen-9-9900x', tdpWatts: 120, source: AMD_LIST }, // Ryzen 9 9900X
  { partId: 'amd-ryzen-9-9900x3d', tdpWatts: 120, source: AMD_LIST }, // Ryzen 9 9900X3D
  { partId: 'amd-ryzen-9-9950x', tdpWatts: 170, source: AMD_LIST }, // Ryzen 9 9950X
  { partId: 'amd-ryzen-9-9950x3d', tdpWatts: 170, source: AMD_LIST }, // Ryzen 9 9950X3D
  // Not covered: Core Ultra 5 250K and Core Ultra 7 270K. Too recent to appear
  // in the source tables yet; they keep the assumed figure until added, which
  // the power rule reports rather than hides.
]

export const CURATED_CPU_BY_ID: Map<string, CuratedCpu> = new Map(
  CURATED_CPUS.map((c) => [c.partId, c]),
)
