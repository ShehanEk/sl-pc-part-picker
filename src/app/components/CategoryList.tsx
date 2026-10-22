'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { matchesQuery } from '@/lib/search'
import type { Category } from '@/lib/site'

/**
 * The filterable list on a category page.
 *
 * Filtering runs in the browser so the page itself stays prerendered: the first
 * HTML holds every part, out of stock included, sorted cheapest first. That
 * matters beyond speed. A category page is the only crawl path to its part
 * pages, so a filter that dropped rows on the server would orphan them.
 *
 * Unticking a shop re-prices every row from the shops still ticked, because the
 * question on this page is "where is it cheapest", not "is it listed".
 */

export type ListOffer = { shop: string; priceLkr: number; buyable: boolean }

export type ListRow = {
  partId: string
  model: string
  brand: string
  specs: string
  /** One value per entry in `facets`, in the same order; null when unknown. */
  facets: (string | null)[]
  offers: ListOffer[]
}

export type ListFacet = { label: string; order?: string[] }

type Sort = 'price' | 'saving' | 'shops'

/** Placeholder examples: words that really occur in each category's names and specs. */
const FILTER_EXAMPLES: Record<Category, string> = {
  cpu: 'Ryzen 5 or 14600',
  motherboard: 'B650 or AM5',
  ram: 'DDR5 or 32GB',
  gpu: '5060 or 16GB',
  storage: 'NVMe or 1TB',
  psu: '750W or Gold',
  case: 'ATX',
  peripherals: 'G502 or DualSense',
}

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-LK')}`

export function CategoryList({
  slot,
  rows,
  facets,
  shops,
  noun,
}: {
  slot: Category
  rows: ListRow[]
  facets: ListFacet[]
  shops: string[]
  noun: string
}) {
  const [hideOutOfStock, setHideOutOfStock] = useState(false)
  const [brands, setBrands] = useState<Set<string>>(new Set())
  // One set of chosen values per facet. Within a facet, values are OR;
  // across facets, AND: DDR5 and 32 GB means DDR5 kits that are 32 GB.
  const [picked, setPicked] = useState<Set<string>[]>(() => facets.map(() => new Set()))
  const [shopsOn, setShopsOn] = useState<Set<string>>(new Set(shops))
  const [sort, setSort] = useState<Sort>('price')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [query, setQuery] = useState('')

  const brandCounts = useMemo(() => countBy(rows.map((r) => r.brand)), [rows])
  const facetCounts = useMemo(
    () => facets.map((_, i) => countBy(rows.flatMap((r) => (r.facets[i] ? [r.facets[i]] : [])))),
    [rows, facets],
  )

  const shown = useMemo(() => {
    const priced = rows.flatMap((row) => {
      if (query && !matchesQuery(`${row.brand} ${row.model} ${row.specs} ${row.facets.join(' ')}`, query)) return []
      if (brands.size && !brands.has(row.brand)) return []
      if (picked.some((set, i) => set.size > 0 && !set.has(row.facets[i] ?? ''))) return []
      const offers = row.offers.filter((o) => shopsOn.has(o.shop))
      if (offers.length === 0) return []
      const buyable = offers.filter((o) => o.buyable)
      if (hideOutOfStock && buyable.length === 0) return []
      const prices = buyable.map((o) => o.priceLkr)
      const best = prices.length ? Math.min(...prices) : null
      return [
        {
          row,
          best,
          worst: prices.length ? Math.max(...prices) : null,
          at: best !== null ? buyable.find((o) => o.priceLkr === best)!.shop : null,
          inStock: buyable.length,
          lastListed: Math.min(...offers.map((o) => o.priceLkr)),
        },
      ]
    })

    const price = (p: (typeof priced)[number]) => p.best ?? p.lastListed
    const saving = (p: (typeof priced)[number]) =>
      p.best !== null && p.worst !== null ? p.worst - p.best : -1

    return priced.sort(
      (a, b) =>
        Number(b.inStock > 0) - Number(a.inStock > 0) ||
        (sort === 'saving' ? saving(b) - saving(a) : 0) ||
        (sort === 'shops' ? b.inStock - a.inStock : 0) ||
        price(a) - price(b),
    )
  }, [rows, query, brands, picked, shopsOn, hideOutOfStock, sort])

  const filtering =
    hideOutOfStock ||
    brands.size > 0 ||
    picked.some((set) => set.size > 0) ||
    shopsOn.size !== shops.length

  const reset = () => {
    setHideOutOfStock(false)
    setBrands(new Set())
    setPicked(facets.map(() => new Set()))
    setShopsOn(new Set(shops))
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <button
        type="button"
        aria-expanded={filtersOpen}
        aria-controls="filters"
        onClick={() => setFiltersOpen((o) => !o)}
        className="glass inline-flex min-h-11 items-center gap-2 px-4 text-[14px] font-medium lg:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters{filtering ? ' (on)' : ''}
      </button>

      <aside
        id="filters"
        aria-label="Filters"
        className={`glass w-full flex-col gap-5 p-5 lg:flex lg:w-[260px] lg:flex-none ${
          filtersOpen ? 'flex' : 'hidden'
        }`}
      >
        <label className="flex min-h-7 items-center gap-2.5 text-[14px] font-medium">
          <input
            type="checkbox"
            checked={hideOutOfStock}
            onChange={(e) => setHideOutOfStock(e.target.checked)}
            className="h-[18px] w-[18px] accent-[var(--accent)]"
          />
          In stock only
        </label>

        {facets.map((facet, i) =>
          Object.keys(facetCounts[i]).length > 1 && (
          <fieldset key={facet.label} className="m-0 border-0 p-0">
            <legend className="eyebrow pb-2.5 text-[11px]">{facet.label}</legend>
            <div className="flex flex-wrap gap-1.5">
              {sortValues(Object.keys(facetCounts[i]), facet.order).map((value) => {
                const on = picked[i].has(value)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked(picked.map((set, j) => (j === i ? toggle(set, value) : set)))}
                    className={`mono min-h-9 rounded-[10px] border px-2.5 text-[12px] transition ${
                      on
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[rgb(30_50_100/12%)] bg-white text-ink-2 hover:border-[var(--accent-soft-border)]'
                    }`}
                  >
                    {value}
                  </button>
                )
              })}
            </div>
          </fieldset>
          ),
        )}

        {Object.keys(brandCounts).length > 1 && (
          <fieldset className="m-0 border-0 p-0">
            <legend className="eyebrow pb-2 text-[11px]">Brand</legend>
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
              {Object.entries(brandCounts)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([brand, n]) => (
                  <label key={brand} className="flex items-center justify-between gap-2.5 text-[14px]">
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={brands.has(brand)}
                        onChange={() => setBrands(toggle(brands, brand))}
                        className="h-[18px] w-[18px] accent-[var(--accent)]"
                      />
                      {brand}
                    </span>
                    <span className="mono text-[12px] text-ink-3">{n}</span>
                  </label>
                ))}
            </div>
          </fieldset>
        )}

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="eyebrow pb-2 text-[11px]">Shops</legend>
          {shops.map((shop) => (
            <label key={shop} className="mono flex items-center gap-2.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={shopsOn.has(shop)}
                onChange={() => setShopsOn(toggle(shopsOn, shop))}
                className="h-[18px] w-[18px] accent-[var(--accent)]"
              />
              {shop}
            </label>
          ))}
        </fieldset>

        {filtering && (
          <button
            type="button"
            onClick={reset}
            className="hidden min-h-10 rounded-[var(--radius-sm)] border border-[rgb(30_50_100/12%)] bg-white text-[13.5px] font-medium text-ink-2 hover:text-ink lg:block"
          >
            Clear filters
          </button>
        )}

        {/* Phones: with the panel open the list is five groups away, so a bar
            pinned to the bottom says how many match and goes straight there. */}
        <div className="sticky bottom-3 flex gap-2 rounded-[18px] border border-[rgb(30_50_100/10%)] bg-white/95 p-2.5 shadow-[0_-8px_24px_-12px_rgb(35_55_110/35%)] lg:hidden">
          {filtering && (
            <button
              type="button"
              onClick={reset}
              className="min-h-[46px] rounded-[12px] border border-[rgb(30_50_100/14%)] bg-white px-3.5 text-[14px] font-semibold text-ink-2"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setFiltersOpen(false)
              document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="min-h-[46px] flex-1 rounded-[12px] bg-[var(--accent)] text-[15px] font-semibold text-white"
          >
            Show {shown.length} {shown.length === 1 ? 'result' : 'results'}
          </button>
        </div>
      </aside>

      <section
        aria-labelledby="results"
        className="glass min-w-0 flex-[999_1_560px] overflow-hidden"
      >
        <div className="hairline-b flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
          {/* scroll-mt clears the sticky header when "Show results" jumps here. */}
          <h2 id="results" className="scroll-mt-36 text-[14px] font-semibold" aria-live="polite">
            {query || filtering ? `${shown.length} of ${rows.length}` : shown.length} {noun}
          </h2>
          <label className="flex min-h-9 max-w-[340px] flex-[1_1_220px] items-center gap-2 rounded-[10px] border border-[rgb(30_50_100/12%)] bg-white px-3 focus-within:border-[var(--accent)]">
            <span className="sr-only">Filter {noun}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="flex-none text-ink-3" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter, e.g. ${FILTER_EXAMPLES[slot]}`}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="min-h-9 rounded-[10px] border border-[rgb(30_50_100/12%)] bg-white px-2.5 text-[13px] text-ink"
            >
              <option value="price">Lowest price first</option>
              <option value="saving">Biggest price gap first</option>
              <option value="shops">Most shops in stock</option>
            </select>
          </label>
        </div>

        {shown.length === 0 && query ? (
          <p className="px-5 py-8 text-[13.5px] text-ink-3">
            No {noun} match “{query}”{filtering ? ' with these filters' : ''}.{' '}
            <button type="button" onClick={() => setQuery('')} className="text-accent underline underline-offset-2">
              Clear the search
            </button>
          </p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-8 text-[13.5px] text-ink-3">
            Nothing matches those filters.{' '}
            <button type="button" onClick={reset} className="text-accent underline underline-offset-2">
              Clear them
            </button>
          </p>
        ) : (
          <ul>
            {shown.map(({ row, best, worst, at, inStock, lastListed }) => (
              <li key={row.partId} className="hairline-b last:border-b-0">
                <Link
                  href={`/${slot}/${row.partId}`}
                  className="row-tap flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5"
                >
                  <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                        {row.model}
                      </span>
                      <span className="mono hidden flex-none rounded-full bg-[rgb(30_50_100/5%)] px-2 py-[3px] text-[10px] text-ink-2 sm:inline">
                        {row.brand}
                      </span>
                    </span>
                    <span className="truncate text-[12.5px] text-ink-3">
                      {[row.specs, inStock > 0 ? `${inStock} ${inStock === 1 ? 'shop' : 'shops'} in stock` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>

                  <span className="hidden flex-[1_1_170px] text-[12.5px] text-ink-3 md:block">
                    {inStock === 0
                      ? 'Out of stock everywhere'
                      : inStock === 1
                        ? 'Only one shop has it in stock'
                        : best === worst
                          ? `Same price at all ${inStock} shops`
                          : `Up to ${rs(worst!)} elsewhere`}
                  </span>

                  <span className="ml-auto flex flex-col items-end gap-0.5 text-right">
                    {best !== null ? (
                      <>
                        <span className="mono whitespace-nowrap text-[17px] font-medium tracking-[-0.02em] text-accent">
                          {rs(best)}
                        </span>
                        <span className="text-[12.5px] text-ink-2">at {at}</span>
                      </>
                    ) : (
                      <>
                        <span className="mono whitespace-nowrap text-[15px] text-ink-3">
                          {rs(lastListed)}
                        </span>
                        <span className="text-[12.5px] text-ink-3">last listed, out of stock</span>
                      </>
                    )}
                  </span>

                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="flex-none text-ink-4" aria-hidden>
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of values) out[v] = (out[v] ?? 0) + 1
  return out
}

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/**
 * "8 GB" before "12 GB": numbers by value, everything else alphabetically,
 * unless the facet gives its own order (80+ Bronze before Gold before Platinum).
 */
function sortValues(values: string[], order?: string[]): string[] {
  if (order) {
    const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length)
    return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }
  const num = (v: string) => {
    const m = v.match(/^([\d.]+)\s*(TB|GB|W)?/)
    if (!m) return null
    return Number(m[1]) * (m[2] === 'TB' ? 1000 : 1)
  }
  return values.sort((a, b) => {
    const x = num(a)
    const y = num(b)
    return x !== null && y !== null ? x - y : a.localeCompare(b)
  })
}
