import type { Metadata } from 'next'
import Link from 'next/link'

import { CATEGORY_STYLE } from '../components/PartIcons'
import { SearchBox } from '../components/SearchBox'
import { SiteFooter, SiteHeader } from '../components/SiteChrome'

import { BUILD_SLOTS } from '@/compat/build'
import { CATEGORY_COPY, rupees, sentenceCase } from '@/lib/site'
import { searchParts } from '@/lib/search'
import { loadDirectory } from '@/queries/seo'

/**
 * Search results. Rendered per request from the cached directory.
 *
 * Kept out of the index: a results page for every string anyone types is thin
 * duplicate content, and the category and part pages already rank for what
 * people actually search for.
 */

const SHOWN = 50

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }

async function readQuery(searchParams: Props['searchParams']): Promise<string> {
  const q = (await searchParams).q
  return (Array.isArray(q) ? q[0] : q ?? '').trim().slice(0, 100)
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = await readQuery(searchParams)
  return {
    title: q ? `“${q}” prices in Sri Lanka` : 'Search PC parts',
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const q = await readQuery(searchParams)
  const directory = await loadDirectory()
  const results = q ? searchParts(directory, q) : []
  const shown = results.slice(0, SHOWN)

  return (
    <>
      <SiteHeader search={false} />

      <main className="mx-auto max-w-[1240px] px-5 pb-6 sm:px-8">
        <div className="flex flex-col gap-4 pb-6 pt-10">
          <h1 className="m-0 text-[clamp(26px,3vw,34px)] font-semibold tracking-[-0.03em]">
            {q ? (
              <>
                {results.length} {results.length === 1 ? 'result' : 'results'} for “{q}”
              </>
            ) : (
              'Search PC parts'
            )}
          </h1>
          <SearchBox large defaultValue={q} />
        </div>

        {q && results.length === 0 && (
          <div className="glass flex flex-col gap-3 px-6 py-6">
            <p className="m-0 text-[15px]">Nothing matches “{q}”.</p>
            <p className="m-0 text-[13.5px] text-ink-2">
              Try fewer words, or a model number on its own. Or browse a category:
            </p>
            <ul className="flex flex-wrap gap-2">
              {BUILD_SLOTS.map((slot) => (
                <li key={slot}>
                  <Link
                    href={`/${slot}`}
                    className="inline-block rounded-full border border-[var(--glass-border)] bg-white/90 px-3.5 py-2 text-[13.5px] text-ink-2 hover:text-ink"
                  >
                    {sentenceCase(CATEGORY_COPY[slot].plural)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {shown.length > 0 && (
          <section aria-label="Results" className="glass overflow-hidden">
            <ul>
              {shown.map((p) => {
                const { Icon, tint, ink } = CATEGORY_STYLE[p.category]
                return (
                  <li key={p.partId} className="hairline-b last:border-b-0">
                    <Link
                      href={`/${p.category}/${p.partId}`}
                      className="row-tap flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
                    >
                      <span
                        className="grid h-10 w-10 flex-none place-items-center rounded-[11px]"
                        style={{ background: tint, color: ink }}
                      >
                        <Icon className="h-[22px] w-[22px]" />
                      </span>
                      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                          {p.model}
                        </span>
                        <span className="text-[12.5px] text-ink-3">
                          {sentenceCase(CATEGORY_COPY[p.category].singular)} · {p.brand}
                          {p.inStockShops > 0 &&
                            ` · ${p.inStockShops} ${p.inStockShops === 1 ? 'shop' : 'shops'} in stock`}
                        </span>
                      </span>
                      <span className="ml-auto flex flex-col items-end gap-0.5 text-right">
                        {p.bestLkr !== null ? (
                          <>
                            <span className="mono whitespace-nowrap text-[17px] font-medium tracking-[-0.02em] text-accent">
                              {rupees(p.bestLkr)}
                            </span>
                            <span className="text-[12.5px] text-ink-2">at {p.offers[0].shop}</span>
                          </>
                        ) : (
                          <>
                            <span className="mono whitespace-nowrap text-[15px] text-ink-3">
                              {rupees(p.lowLkr)}
                            </span>
                            <span className="text-[12.5px] text-ink-3">last listed, out of stock</span>
                          </>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {results.length > SHOWN && (
              <p className="m-0 bg-[var(--sunken)] px-5 py-3 text-[12.5px] text-ink-3">
                Showing the first {SHOWN} of {results.length}. Add a word to narrow it down.
              </p>
            )}
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  )
}
