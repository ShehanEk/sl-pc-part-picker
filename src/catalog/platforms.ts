/**
 * Platform reference: sockets and memory generations.
 *
 * This is the highest-leverage data in the project. A socket is not a property
 * of an individual part that has to be looked up one by one — it follows from
 * the chipset on a board, and from the generation of a processor. Two small
 * tables therefore cover every motherboard and CPU the shops carry, present and
 * future, where the GPU catalogue needed 54 hand-written rows for one category.
 *
 * 299 of 304 motherboard titles scraped so far name their chipset, so this
 * resolves almost the entire catalogue straight from the listing text.
 */

export type Socket = 'AM4' | 'AM5' | 'LGA1200' | 'LGA1700' | 'LGA1851'
export type RamType = 'DDR4' | 'DDR5'

type Platform = {
  socket: Socket
  /**
   * Memory generation the platform fixes. Null where the platform supports
   * both and the individual board decides — Intel's 600 and 700 series ship in
   * DDR4 and DDR5 variants, which is why those titles almost always say which.
   */
  ramType: RamType | null
}

/**
 * Desktop chipsets, without the trailing E or M. The suffixes denote extra
 * PCIe lanes and a smaller board respectively; neither changes the socket.
 */
export const CHIPSETS: Record<string, Platform> = {
  // --- AMD AM4, DDR4 --------------------------------------------------------
  A320: { socket: 'AM4', ramType: 'DDR4' },
  B350: { socket: 'AM4', ramType: 'DDR4' },
  X370: { socket: 'AM4', ramType: 'DDR4' },
  B450: { socket: 'AM4', ramType: 'DDR4' },
  X470: { socket: 'AM4', ramType: 'DDR4' },
  A520: { socket: 'AM4', ramType: 'DDR4' },
  B550: { socket: 'AM4', ramType: 'DDR4' },
  X570: { socket: 'AM4', ramType: 'DDR4' },

  // --- AMD AM5, DDR5 --------------------------------------------------------
  A620: { socket: 'AM5', ramType: 'DDR5' },
  B650: { socket: 'AM5', ramType: 'DDR5' },
  X670: { socket: 'AM5', ramType: 'DDR5' },
  B840: { socket: 'AM5', ramType: 'DDR5' },
  B850: { socket: 'AM5', ramType: 'DDR5' },
  X870: { socket: 'AM5', ramType: 'DDR5' },

  // --- Intel LGA1200, DDR4 --------------------------------------------------
  H410: { socket: 'LGA1200', ramType: 'DDR4' },
  B460: { socket: 'LGA1200', ramType: 'DDR4' },
  H470: { socket: 'LGA1200', ramType: 'DDR4' },
  Z490: { socket: 'LGA1200', ramType: 'DDR4' },
  H510: { socket: 'LGA1200', ramType: 'DDR4' },
  B560: { socket: 'LGA1200', ramType: 'DDR4' },
  H570: { socket: 'LGA1200', ramType: 'DDR4' },
  Z590: { socket: 'LGA1200', ramType: 'DDR4' },

  // --- Intel LGA1700, DDR4 *or* DDR5 ----------------------------------------
  H610: { socket: 'LGA1700', ramType: null },
  B660: { socket: 'LGA1700', ramType: null },
  H670: { socket: 'LGA1700', ramType: null },
  Z690: { socket: 'LGA1700', ramType: null },
  B760: { socket: 'LGA1700', ramType: null },
  H770: { socket: 'LGA1700', ramType: null },
  Z790: { socket: 'LGA1700', ramType: null },

  // --- Intel LGA1851, DDR5 --------------------------------------------------
  H810: { socket: 'LGA1851', ramType: 'DDR5' },
  B860: { socket: 'LGA1851', ramType: 'DDR5' },
  W880: { socket: 'LGA1851', ramType: 'DDR5' },
  Z890: { socket: 'LGA1851', ramType: 'DDR5' },
}

export type ChipsetMatch = {
  /** Canonical chipset, e.g. B650 */
  chipset: string
  /** As written, e.g. B650M */
  raw: string
  socket: Socket
  ramType: RamType | null
  /** The M suffix denotes a micro-ATX board. */
  microAtx: boolean
}

/**
 * Find the chipset named in a listing title.
 *
 * Anchored on a word boundary and validated against the table rather than
 * pattern-matched loosely: plenty of unrelated tokens look like a chipset
 * ("B550" is one, but so is a random model code), and inventing a socket is
 * worse than not finding one.
 */
export function findChipset(title: string): ChipsetMatch | null {
  // A trailing \b would reject "A620AM-B", where the board's own model code runs
  // straight on from the chipset. Only a following digit is disqualifying.
  for (const m of title.matchAll(/(?<![a-z0-9])([ABHXZW])[- ]?(\d{3})([EM])?(?![0-9])/gi)) {
    const chipset = `${m[1].toUpperCase()}${m[2]}`
    const platform = CHIPSETS[chipset]
    if (!platform) continue
    const suffix = m[3]?.toUpperCase()
    return {
      chipset,
      raw: `${chipset}${suffix ?? ''}`,
      socket: platform.socket,
      ramType: platform.ramType,
      microAtx: suffix === 'M',
    }
  }
  return null
}

/**
 * Socket and memory generation for a processor, from its model number.
 *
 * AMD encodes the generation in the leading digit of a four-digit Ryzen number,
 * and Intel in the leading one or two digits of a Core i number. Neither needs
 * a per-chip lookup, so this resolves processors the catalogue has never seen.
 *
 * Power draw deliberately is not inferred here. It varies from 35W to 170W
 * within a single generation and is never printed in a listing, so it stays
 * null until curated — the PSU rule may not run on a guess.
 */
export function ryzenPlatform(modelNumber: number): Platform | null {
  const gen = Math.floor(modelNumber / 1000)
  if (gen >= 1 && gen <= 5) return { socket: 'AM4', ramType: 'DDR4' }
  // 6000 was mobile-only; desktop resumed at 7000 on AM5.
  if (gen === 7 || gen === 8 || gen === 9) return { socket: 'AM5', ramType: 'DDR5' }
  return null
}

export function intelCorePlatform(modelNumber: number): Platform | null {
  // 4-digit numbers are 10th generation and later; 5-digit do not occur.
  const gen = modelNumber >= 10000 ? Math.floor(modelNumber / 1000) : Math.floor(modelNumber / 100)
  if (gen === 10 || gen === 11) return { socket: 'LGA1200', ramType: 'DDR4' }
  if (gen === 12 || gen === 13 || gen === 14) return { socket: 'LGA1700', ramType: null }
  return null
}

/** Core Ultra 200 series sits on LGA1851. */
export function intelUltraPlatform(modelNumber: number): Platform | null {
  if (modelNumber >= 200 && modelNumber < 300) return { socket: 'LGA1851', ramType: 'DDR5' }
  return null
}
