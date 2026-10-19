'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { BuildSlot } from '@/compat/build'
import { matchesQuery } from '@/lib/search'

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
  facet: string | null
  offers: ListOffer[]
}

type Sort = 'price' | 'saving' | 'shops'

/** Placeholder examples: words that really occur in each category's names and specs. */
const FILTER_EXAMPLES: Record<BuildSlot, string> = {
  cpu: 'Ryzen 5 or 14600',
  motherboard: 'B650 or AM5',
  ram: 'DDR5 or 32GB',
  gpu: '5060 or 16GB',
  storage: 'NVMe or 1TB',
  psu: '750W or Gold',
  case: 'ATX',
}

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-LK')}`

export function CategoryList({
  slot,
  rows,
  facetLabel,
  shops,
  noun,
}: {
  slot: BuildSlot
  rows: ListRow[]
  facetLabel: string
  shops: string[]
  noun: string
}) {
  const [hideOutOfStock, setHideOutOfStock] = useState(false)
  const [brands, setBrands] = useState<Set<string>>(new Set())
  const [facets, setFacets] = useState<Set<string>>(new Set())
  const [shopsOn, setShopsOn] = useState<Set<string>>(new Set(shops))
  const [sort, setSort] = useState<Sort>('price')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [query, setQuery] = useState('')

  const brandCounts = useMemo(() => countBy(rows.map((r) => r.brand)), [rows])
  const facetCounts = useMemo(
    () => countBy(rows.flatMap((r) => (r.facet ? [r.facet] : []))),
    [rows],
  )

  const shown = useMemo(() => {
    const priced = rows.flatMap((row) => {
      if (query && !matchesQuery(`${row.brand} ${row.model} ${row.specs} ${row.facet ?? ''}`, query)) return []
      if (brands.size && !brands.has(row.brand)) return []
      if (facets.size && (!row.facet || !facets.has(row.facet))) return []
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
  }, [rows, query, brands, facets, shopsOn, hideOutOfStock, sort])

  const filtering =
    hideOutOfStock || brands.size > 0 || facets.size > 0 || shopsOn.size !== shops.length

  const reset = () => {
    setHideOutOfStock(false)
    setBrands(new Set())
    setFacets(new Set())
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

        {Object.keys(facetCounts).length > 1 && (
          <fieldset className="m-0 border-0 p-0">
            <legend className="eyebrow pb-2.5 text-[11px]">{facetLabel}</legend>
            <div className="flex flex-wrap gap-1.5">
              {sortValues(Object.keys(facetCounts)).map((value) => {
                const on = facets.has(value)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFacets(toggle(facets, value))}
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
            className="min-h-10 rounded-[var(--radius-sm)] border border-[rgb(30_50_100/12%)] bg-white text-[13.5px] font-medium text-ink-2 hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </aside>

      <section
        aria-labelledby="results"
        className="glass min-w-0 flex-[999_1_560px] overflow-hidden"
      >
        <div className="hairline-b flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
          <h2 id="results" className="text-[14px] font-semibold" aria-live="polite">
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

/** "8 GB" before "12 GB": numbers by value, everything else alphabetically. */
function sortValues(values: string[]): string[] {
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
