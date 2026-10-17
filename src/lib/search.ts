import { BUILD_SLOTS } from '@/compat/build'
import { CATEGORY_COPY } from '@/lib/site'
import type { Directory, SeoPart } from '@/queries/seo'

/**
 * Part search over the directory the pages already load. ~1,300 parts is small
 * enough that a scan beats adding a search index to run and keep in sync.
 *
 * Matching is by word, not substring. Squashing a whole name into one string
 * and searching inside it was the first version, and it was wrong in ways that
 * mattered: "Ryzen 7" ranked a Ryzen 5 7500F first (the "7" of "7500F"), and
 * "B650" found a power supply named "…650B 650W". So each query word must
 * *start* a word of the name, and a short number must *be* one: "7" is the 7
 * of "Ryzen 7", never the start of "7500F".
 *
 * Runs of two or three words are also tried joined, so "rtx5070" still finds
 * "RTX 5070". A name containing the whole query as typed ranks first.
 */
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

function matchesWord(nameWords: string[], q: string): boolean {
  const exact = /^\d{1,2}$/.test(q)
  for (let i = 0; i < nameWords.length; i++) {
    let joined = ''
    for (let len = 0; len < 3 && i + len < nameWords.length; len++) {
      joined += nameWords[i + len]
      if (exact ? joined === q : joined.startsWith(q)) return true
    }
  }
  return false
}

export function searchParts(directory: Directory, query: string): SeoPart[] {
  const queryWords = words(query)
  if (queryWords.length === 0) return []
  const phrase = squash(query)

  const hits: { part: SeoPart; phrase: boolean }[] = []
  for (const slot of BUILD_SLOTS) {
    const copy = CATEGORY_COPY[slot]
    for (const part of directory[slot]) {
      const name = `${part.brand} ${part.model} ${copy.heading} ${copy.plural}`
      const nameWords = words(name)
      if (queryWords.every((q) => matchesWord(nameWords, q))) {
        hits.push({ part, phrase: squash(`${part.brand} ${part.model}`).includes(phrase) })
      }
    }
  }

  // Then buyable first, then cheapest: the question being asked is where to buy.
  return hits
    .sort(
      (a, b) =>
        Number(b.phrase) - Number(a.phrase) ||
        Number(b.part.inStockShops > 0) - Number(a.part.inStockShops > 0) ||
        (a.part.bestLkr ?? a.part.lowLkr) - (b.part.bestLkr ?? b.part.lowLkr),
    )
    .map((h) => h.part)
}
