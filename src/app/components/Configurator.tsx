'use client'

import Link from 'next/link'
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type SVGProps,
} from 'react'

import {
  CaseIcon,
  CpuIcon,
  GpuIcon,
  MotherboardIcon,
  PsuIcon,
  RamIcon,
  StorageIcon,
} from './PartIcons'
import {
  BUILD_SLOTS,
  SLOT_LABEL,
  evaluateBuild,
  rankCandidates,
  suggestNextSlot,
  type Build,
  type BuildSlot,
} from '@/compat/build'
import type { CheckStatus } from '@/compat/rules'
import {
  getBuildSnapshot,
  getServerBuildSnapshot,
  setStoredBuild,
  subscribeBuild,
  type StoredBuild,
} from '@/lib/build-store'
import type { PartOffer } from '@/queries/build'

/**
 * The configurator.
 *
 * The whole catalogue is held in the browser, so choosing a part is immediate
 * and every list is a filter over data already here. The compatibility rules
 * are pure functions and run unchanged on this side.
 *
 * The choices themselves live in `build-store`, which survives navigation —
 * each row links out to that part's own page, and losing the build on the way
 * there would make the link something you learn not to click.
 */

const rs = (n: number) => `Rs ${n.toLocaleString('en-LK')}`

/** One tile colour per category, so a row is recognisable before it is read. */
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const SLOT_STYLE: Record<BuildSlot, { Icon: IconComponent; tint: string; ink: string }> = {
  cpu: { Icon: CpuIcon, tint: 'rgb(120 150 255 / 14%)', ink: 'oklch(0.5 0.17 262)' },
  motherboard: { Icon: MotherboardIcon, tint: 'rgb(90 200 160 / 16%)', ink: 'oklch(0.48 0.13 165)' },
  ram: { Icon: RamIcon, tint: 'rgb(175 130 255 / 15%)', ink: 'oklch(0.52 0.17 300)' },
  gpu: { Icon: GpuIcon, tint: 'rgb(255 130 160 / 15%)', ink: 'oklch(0.55 0.17 15)' },
  storage: { Icon: StorageIcon, tint: 'rgb(120 200 230 / 17%)', ink: 'oklch(0.5 0.11 225)' },
  psu: { Icon: PsuIcon, tint: 'rgb(255 180 100 / 18%)', ink: 'oklch(0.53 0.14 65)' },
  case: { Icon: CaseIcon, tint: 'rgb(150 165 195 / 18%)', ink: 'oklch(0.45 0.03 260)' },
}

const TONE: Record<CheckStatus, string> = {
  pass: 'text-ok',
  fail: 'text-bad',
  warn: 'text-warn',
  unknown: 'text-warn',
}

type Sort = 'price' | 'name' | 'shops'

export type Catalogue = Record<BuildSlot, PartOffer[]>

/** Re-point a catalogue part at a specific seller, if that seller still has it. */
function withShop(part: PartOffer, shop: string | null): PartOffer {
  if (!shop) return part
  const offer = part.offers.find((o) => o.shop === shop)
  return offer ? { ...part, shop: offer.shop, priceLkr: offer.priceLkr } : part
}

export function Configurator({ catalogue }: { catalogue: Catalogue }) {
  const stored = useSyncExternalStore(
    subscribeBuild,
    getBuildSnapshot,
    getServerBuildSnapshot,
  )

  /**
   * The build is derived from the stored choices rather than held alongside
   * them, so there is one source of truth and no chance of the two drifting.
   * A part that has since sold out everywhere is gone from the catalogue and
   * drops out here quietly, which beats restoring a build we cannot price.
   */
  const build = useMemo<Build>(() => {
    const next: Build = {}
    for (const slot of BUILD_SLOTS) {
      const choice = stored[slot]
      if (!choice) continue
      const part = catalogue[slot].find((p) => p.partId === choice.partId)
      if (part) next[slot] = withShop(part, choice.shop)
    }
    return next
  }, [stored, catalogue])

  const [openedSlot, setOpenedSlot] = useState<BuildSlot | null>(null)
  const [expandedShops, setExpandedShops] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('price')

  const report = useMemo(() => evaluateBuild(build), [build])
  const suggestion = useMemo(() => suggestNextSlot(build), [build])
  const activeSlot: BuildSlot = openedSlot ?? suggestion?.slot ?? 'cpu'

  const ranked = useMemo(
    () => rankCandidates(build, activeSlot, catalogue[activeSlot]),
    [build, activeSlot, catalogue],
  )

  const fitting = ranked.filter((o) => o.status !== 'fail')
  const blocked = ranked.length - fitting.length
  const firstBlocked = ranked.find((r) => r.status === 'fail')?.blockedBy

  const items = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const filtered = terms.length
      ? fitting.filter((o) => {
          const hay = `${o.part.model} ${o.part.brand} ${o.part.shop ?? ''}`.toLowerCase()
          return terms.every((t) => hay.includes(t))
        })
      : fitting
    const sorted = [...filtered]
    if (sort === 'price') sorted.sort((a, b) => (a.part.priceLkr ?? 0) - (b.part.priceLkr ?? 0))
    if (sort === 'name') sorted.sort((a, b) => a.part.model.localeCompare(b.part.model))
    if (sort === 'shops') sorted.sort((a, b) => b.part.offers.length - a.part.offers.length)
    return sorted
  }, [fitting, query, sort])

  const choose = (slot: BuildSlot, part: PartOffer, shop?: string) => {
    // A shop is only pinned when the buyer picked one. Left null, the slot keeps
    // following whichever shop is cheapest as prices move.
    setStoredBuild({ ...stored, [slot]: { partId: part.partId, shop: shop ?? null } })
    setExpandedShops(null)
    setOpenedSlot(null)
    setQuery('')
  }

  const clearSlot = (slot: BuildSlot) => {
    const next: StoredBuild = { ...stored }
    delete next[slot]
    setStoredBuild(next)
  }

  const openSlot = (slot: BuildSlot) => {
    setOpenedSlot(slot)
    setExpandedShops(null)
    setQuery('')
  }

  const shops = new Set(report.filled.map((s) => build[s]!.shop).filter(Boolean))

  return (
    <div className="mx-auto grid max-w-[1300px] items-start gap-5 px-5 pb-24 pt-6 sm:px-8 lg:grid-cols-[clamp(268px,27vw,348px)_minmax(0,1fr)] lg:gap-[clamp(20px,2.4vw,34px)]">
      {/* ---- Build sidebar -------------------------------------------------- */}
      <aside className="glass overflow-hidden lg:sticky lg:top-[88px]">
        <div className="hairline-b flex items-baseline justify-between px-5 py-4">
          <span className="text-[14.5px] font-semibold tracking-[-0.015em]">Your build</span>
          <span className="mono text-[11px] text-ink-3">
            {report.filled.length}/{BUILD_SLOTS.length}
          </span>
        </div>

        {BUILD_SLOTS.map((slot) => {
          const part = build[slot]
          const style = SLOT_STYLE[slot]
          return (
            <button
              key={slot}
              type="button"
              onClick={() => openSlot(slot)}
              className={`hairline-b row-tap flex w-full items-center gap-3 px-5 py-3 text-left ${
                slot === activeSlot ? 'bg-[var(--row-hover)]' : ''
              }`}
            >
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                style={{ background: style.tint, color: style.ink }}
              >
                <style.Icon className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="eyebrow block">{SLOT_LABEL[slot]}</span>
                <span className={`mt-[3px] block truncate text-[13.5px] ${part ? '' : 'text-ink-4'}`}>
                  {part ? part.model : 'Not chosen'}
                </span>
              </span>
              <span className={`mono flex-none text-[12px] ${part ? '' : 'text-ink-4'}`}>
                {part?.priceLkr != null ? rs(part.priceLkr) : '—'}
              </span>
            </button>
          )
        })}

        <div className="bg-[var(--sunken)] px-5 pb-3.5 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="eyebrow">Total</span>
            <span className="mono flex-none whitespace-nowrap text-[22px] font-medium tracking-[-0.03em]">
              {rs(report.totalLkr)}
            </span>
          </div>
          <div className="mt-1.5 truncate text-[11.5px] text-ink-3">
            {report.filled.length === 0
              ? 'Nothing picked yet'
              : `${report.filled.length} parts · ${shops.size} ${shops.size === 1 ? 'shop' : 'shops'}`}
          </div>

          {(report.checks.length > 0 || report.pending.length > 0) && (
            <ul className="mt-3 space-y-1.5 border-t border-[var(--hairline)] pt-3">
              {report.checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-[11.5px] leading-snug">
                  <span
                    aria-hidden
                    className={`mt-[5px] h-1.5 w-1.5 flex-none rounded-full ${
                      c.status === 'pass' ? 'bg-ok' : c.status === 'fail' ? 'bg-bad' : 'bg-warn'
                    }`}
                  />
                  <span className={c.status === 'pass' ? 'text-ink-3' : TONE[c.status]}>
                    {c.message}
                  </span>
                </li>
              ))}
              {report.pending.map((p) => (
                <li key={p.id} className="flex gap-2 text-[11.5px] leading-snug text-ink-4">
                  <span
                    aria-hidden
                    className="mt-[5px] h-1.5 w-1.5 flex-none rounded-full bg-[oklch(0.78_0.02_260)]"
                  />
                  <span>{p.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--sunken)] px-5 pb-5">
          <button
            type="button"
            onClick={() => setStoredBuild({})}
            disabled={report.filled.length === 0}
            className="w-full rounded-[var(--radius-sm)] border border-[rgb(30_50_100/12%)] bg-white py-3 text-[13.5px] text-ink-2 transition hover:border-[rgb(30_50_100/28%)] disabled:opacity-45"
          >
            Clear build
          </button>
        </div>
      </aside>

      {/* ---- Parts ---------------------------------------------------------- */}
      <main className="min-w-0">
        <div className="mb-4 flex flex-wrap gap-2.5">
          {BUILD_SLOTS.map((slot) => {
            const on = slot === activeSlot
            const style = SLOT_STYLE[slot]
            return (
              <button
                key={slot}
                type="button"
                onClick={() => openSlot(slot)}
                className={`inline-flex flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-medium transition ${
                  on
                    ? 'border-transparent text-white shadow-[0_4px_14px_-6px_rgb(60_90_200/55%)]'
                    : 'border-[var(--glass-border)] bg-white/80 text-ink-2 hover:-translate-y-px'
                }`}
                style={on ? { background: 'var(--accent)' } : undefined}
              >
                <style.Icon
                  className="h-[15px] w-[15px] flex-none"
                  style={{ color: on ? 'rgb(255 255 255 / 85%)' : style.ink }}
                />
                <span className="capitalize">{SLOT_LABEL[slot]}</span>
                <span className="mono ml-1 text-[11px] opacity-55">{catalogue[slot].length}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-11 flex-1 items-center gap-2.5 rounded-[var(--radius-sm)] border border-[rgb(30_50_100/11%)] bg-white px-4">
            <span aria-hidden className="text-[14px] text-ink-4">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search parts, shops…"
              aria-label="Search parts and shops"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-4"
            />
          </div>
          {(['price', 'name', 'shops'] as Sort[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`hidden h-11 flex-none whitespace-nowrap rounded-[var(--radius-sm)] border px-4 text-[12.5px] capitalize transition sm:block ${
                sort === s
                  ? 'border-transparent bg-[var(--accent)] text-white'
                  : 'border-[var(--glass-border)] bg-white/80 text-ink-2'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {blocked > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] px-4 py-3 text-[12.5px] text-[oklch(0.42_0.12_258)]">
            <span className="mono flex-none rounded-full bg-[var(--accent)] px-2 py-[3px] text-[10.5px] text-white">
              FITS
            </span>
            <span>
              {blocked} hidden because they don&apos;t fit — {firstBlocked}
            </span>
          </div>
        )}

        <div className="glass overflow-hidden">
          <div className="hairline-b px-5 py-4">
            <div className="text-[15px] font-semibold capitalize tracking-[-0.015em]">
              {SLOT_LABEL[activeSlot]}
            </div>
            <div className="mt-1 text-[12.5px] text-ink-3">
              {build[activeSlot] ? (
                <>
                  {build[activeSlot]!.model} chosen ·{' '}
                  <button
                    type="button"
                    onClick={() => clearSlot(activeSlot)}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    remove
                  </button>
                </>
              ) : suggestion?.slot === activeSlot ? (
                suggestion.message
              ) : (
                `${items.length} in stock will work`
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-5 py-8 text-[13.5px] text-ink-3">
              {query
                ? `Nothing matches “${query}”.`
                : "Nothing in stock fits the parts you've chosen. Try changing another slot."}
            </div>
          ) : (
            items.slice(0, 40).map((o) => {
              const part = o.part
              const style = SLOT_STYLE[activeSlot]
              const selected = build[activeSlot]?.partId === part.partId
              const open = expandedShops === part.partId
              const caveat = o.checks.find(
                (c) => c.status === 'unknown' || c.status === 'warn',
              )?.message
              const specs = [
                part.socket,
                part.ramType,
                part.capacityGb ? `${part.capacityGb}GB` : null,
                part.speedMhz ? `${part.speedMhz}MHz` : null,
                part.vramGb ? `${part.vramGb}GB` : null,
                part.tdpWatts ? `${part.tdpWatts}W` : null,
                part.ratedWatts ? `${part.ratedWatts}W` : null,
                part.storageInterface,
                activeSlot === 'case' ? part.formFactor : null,
              ]
                .filter(Boolean)
                .slice(0, 3)
                .join(' · ')

              return (
                <div key={part.partId} className="hairline-b relative">
                  <button
                    type="button"
                    onClick={() => choose(activeSlot, part)}
                    className={`row-tap flex w-full items-center gap-4 px-5 py-3.5 text-left ${
                      selected ? 'bg-[var(--accent-soft)]' : ''
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px]"
                      style={{ background: style.tint, color: style.ink }}
                    >
                      <style.Icon className="h-[21px] w-[21px]" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`truncate text-[14.5px] tracking-[-0.015em] ${
                            selected ? 'font-semibold' : ''
                          }`}
                        >
                          {part.model}
                        </span>
                        <span className="mono hidden flex-none rounded-full bg-[rgb(30_50_100/5%)] px-2 py-[3px] text-[10px] text-ink-2 sm:inline">
                          {part.brand}
                        </span>
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2.5">
                        <span className="mono truncate text-[11.5px] text-ink-3">{specs}</span>
                        {selected && (
                          <span className="flex-none text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
                            In build
                          </span>
                        )}
                      </div>
                      {caveat && (
                        <div className="mt-1 text-[11.5px] leading-snug text-ink-4">{caveat}</div>
                      )}
                    </div>

                    <div className="flex w-[120px] flex-none flex-col items-end gap-[3px] text-right sm:w-[168px]">
                      <div className="mono whitespace-nowrap text-[15px] tracking-[-0.02em]">
                        {rs(part.priceLkr ?? 0)}
                      </div>
                      <div className="max-w-full truncate text-[11.5px] text-ink-3">{part.shop}</div>
                      {/* Reserves the band the links below sit in. */}
                      <span aria-hidden className="block h-[22px]" />
                    </div>
                  </button>

                  {/*
                    Both sit outside the row button rather than inside it: a
                    button may not contain another control, and the whole row is
                    one. Positioned over the band the spacer reserves.
                  */}
                  <div className="absolute bottom-[13px] right-5 flex items-center gap-3 text-[11.5px]">
                    {part.offers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setExpandedShops(open ? null : part.partId)}
                        aria-expanded={open}
                        className="whitespace-nowrap py-1 text-accent underline-offset-2 hover:underline"
                      >
                        {open ? 'Hide shops' : `${part.offers.length} shops`}
                      </button>
                    )}
                    <Link
                      href={`/${activeSlot}/${part.partId}`}
                      aria-label={`All prices and specifications for ${part.model}`}
                      className="whitespace-nowrap py-1 text-ink-3 underline-offset-2 hover:text-accent hover:underline"
                    >
                      Details
                    </Link>
                  </div>

                  {open && (
                    <div className="bg-[var(--sunken)] px-5 pb-4 pt-1 sm:pl-[76px]">
                      <div className="eyebrow py-2">Pick a shop</div>
                      <div className="flex flex-col gap-1.5">
                        {part.offers.map((offer) => {
                          const picked =
                            build[activeSlot]?.partId === part.partId &&
                            build[activeSlot]?.shop === offer.shop
                          return (
                            <button
                              key={offer.shop}
                              type="button"
                              onClick={() => choose(activeSlot, part, offer.shop)}
                              className={`flex items-center justify-between gap-4 rounded-[10px] border px-3.5 py-2.5 text-left text-[12.5px] transition ${
                                picked
                                  ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft)]'
                                  : 'border-transparent bg-white/70 hover:border-[var(--glass-border)]'
                              } ${offer.inStock ? '' : 'opacity-55'}`}
                            >
                              <span className="truncate">
                                {offer.shop}
                                {!offer.inStock && (
                                  <span className="ml-2 text-ink-4">out of stock</span>
                                )}
                              </span>
                              <span className="mono flex-none">{rs(offer.priceLkr)}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {items.length > 40 && (
            <div className="px-5 py-3 text-[12.5px] text-ink-4">
              and {items.length - 40} more — narrow it with search.
            </div>
          )}
        </div>

        <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-ink-4">
          We check sockets, memory type, power, and that the board fits the case. We don&apos;t
          check whether the graphics card or cooler physically clear it — those measurements
          aren&apos;t published in local listings, so we&apos;d be guessing.
        </p>
      </main>
    </div>
  )
}
