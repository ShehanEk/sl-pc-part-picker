'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { CATEGORY_STYLE } from './PartIcons'
import {
  BUILD_SLOTS,
  SLOT_LABEL,
  evaluateBuild,
  isBuildComplete,
  isOptionalSlot,
  nextEmptySlot,
  rankCandidates,
  suggestNextSlot,
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
 * The configurator, one part per step.
 *
 * The whole catalogue is held in the browser, so choosing a part is immediate
 * and every list is a filter over data already here. The compatibility rules
 * are pure functions and run unchanged on this side.
 *
 * It is a guided flow rather than a sidebar plus a list because of what the
 * session replays showed on phones: tapping a slot changed a list a screen
 * and a half below, so nothing visible happened and people tapped again, then
 * left. Here a step is the whole screen, picking advances to the next empty
 * slot, and the running total is pinned where a phone can see it.
 *
 * The choices themselves live in `build-store`, which survives navigation —
 * each row links out to that part's own page, and losing the build on the way
 * there would make the link something you learn not to click.
 */

const rs = (n: number) => `Rs ${n.toLocaleString('en-LK')}`

/** Shared with every other page, so a category keeps one colour site-wide. */
const SLOT_STYLE = CATEGORY_STYLE

const TONE: Record<CheckStatus, string> = {
  pass: 'text-ok',
  fail: 'text-bad',
  warn: 'text-warn',
  unknown: 'text-warn',
}

const DOT: Record<CheckStatus, string> = {
  pass: 'bg-ok',
  fail: 'bg-bad',
  warn: 'bg-warn',
  unknown: 'bg-warn',
}

type Sort = 'price' | 'name' | 'shops'
const SORT_LABEL: Record<Sort, string> = { price: 'Cheapest', name: 'Name', shops: 'Most shops' }

/** Which step is on screen. `null` means "whatever comes next", so a reload lands sensibly. */
type View = BuildSlot | 'summary' | null

export type Catalogue = Record<BuildSlot, PartOffer[]>

/** The build with each part's offers still attached, so the summary can link to the chosen shop. */
type OfferBuild = Partial<Record<BuildSlot, PartOffer>>

/** Re-point a catalogue part at a specific seller, if that seller still has it. */
function withShop(part: PartOffer, shop: string | null): PartOffer {
  if (!shop) return part
  const offer = part.offers.find((o) => o.shop === shop)
  return offer ? { ...part, shop: offer.shop, priceLkr: offer.priceLkr } : part
}

const PICK_BUTTON =
  'flex-none rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--accent-strong)]'

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
  const build = useMemo<OfferBuild>(() => {
    const next: OfferBuild = {}
    for (const slot of BUILD_SLOTS) {
      const choice = stored[slot]
      if (!choice) continue
      const part = catalogue[slot].find((p) => p.partId === choice.partId)
      if (part) next[slot] = withShop(part, choice.shop)
    }
    return next
  }, [stored, catalogue])

  const [view, setView] = useState<View>(null)
  const [expandedShops, setExpandedShops] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('price')
  const panelRef = useRef<HTMLDivElement>(null)

  const report = useMemo(() => evaluateBuild(build), [build])
  const suggestion = useMemo(() => suggestNextSlot(build), [build])
  const filled = report.filled.length
  // The cooler is optional: a build with every other part is complete.
  const complete = isBuildComplete(build)

  const resolved: BuildSlot | 'summary' = view ?? (complete ? 'summary' : (suggestion?.slot ?? 'cpu'))
  const activeSlot: BuildSlot = resolved === 'summary' ? 'cpu' : resolved
  const stepNumber = BUILD_SLOTS.indexOf(activeSlot) + 1

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
    // Coolers whose sockets are confirmed come before ones the shop doesn't
    // list sockets for. Stable, so each group keeps the chosen order.
    if (activeSlot === 'cooling') {
      sorted.sort((a, b) => Number(a.status !== 'pass') - Number(b.status !== 'pass'))
    }
    return sorted
  }, [fitting, query, sort, activeSlot])

  /**
   * Every step change scrolls the panel to the top. On a phone the list the
   * buyer was scrolling is replaced by a new one, and starting it mid-way
   * reads as nothing having happened — the exact failure this flow replaces.
   */
  const show = (next: View) => {
    setView(next)
    setExpandedShops(null)
    setQuery('')
  }
  useEffect(() => {
    // `null` is the state on load, where the page is already at the top.
    if (view !== null) panelRef.current?.scrollIntoView({ block: 'start' })
  }, [view])

  const choose = (slot: BuildSlot, part: PartOffer, shop?: string) => {
    // A shop is only pinned when the buyer picked one. Left null, the slot keeps
    // following whichever shop is cheapest as prices move.
    setStoredBuild({ ...stored, [slot]: { partId: part.partId, shop: shop ?? null } })
    show(nextEmptySlot({ ...build, [slot]: part }, slot) ?? 'summary')
  }

  const skip = (slot: BuildSlot) => show(nextEmptySlot(build, slot) ?? 'summary')

  const clearSlot = (slot: BuildSlot) => {
    const next: StoredBuild = { ...stored }
    delete next[slot]
    setStoredBuild(next)
  }

  const shops = new Set(report.filled.map((s) => build[s]!.shop).filter(Boolean))
  const shopsLine =
    filled === 0
      ? 'Nothing picked yet'
      : `${filled} ${filled === 1 ? 'part' : 'parts'} · ${shops.size} ${shops.size === 1 ? 'shop' : 'shops'}`

  return (
    <div className="mx-auto grid max-w-[1300px] items-start gap-5 px-5 pb-28 pt-6 sm:px-8 lg:grid-cols-[clamp(268px,27vw,348px)_minmax(0,1fr)] lg:gap-[clamp(20px,2.4vw,34px)] lg:pb-24">
      {/* ---- Step list: desktop only; it is the build summary too ---------- */}
      <aside className="glass hidden overflow-hidden lg:sticky lg:top-[88px] lg:block">
        <div className="hairline-b flex items-baseline justify-between px-5 py-4">
          <span className="text-[14.5px] font-semibold tracking-[-0.015em]">Your build</span>
          <span className="mono text-[11px] text-ink-3">
            {filled}/{BUILD_SLOTS.length}
          </span>
        </div>

        {BUILD_SLOTS.map((slot, i) => {
          const part = build[slot]
          const style = SLOT_STYLE[slot]
          const current = resolved === slot
          return (
            <button
              key={slot}
              type="button"
              onClick={() => show(slot)}
              aria-current={current ? 'step' : undefined}
              className={`hairline-b row-tap flex w-full items-center gap-3 border-l-[3px] px-5 py-3 text-left ${
                current
                  ? 'border-l-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-l-transparent'
              } ${!part && !current ? 'opacity-60' : ''}`}
            >
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                style={{ background: style.tint, color: style.ink }}
              >
                <style.Icon className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`eyebrow block ${part ? 'text-ok' : current ? 'text-accent' : ''}`}
                >
                  {i + 1} · {SLOT_LABEL[slot]}
                  {part ? ' ✓' : current ? ' · choosing' : ''}
                </span>
                <span className={`mt-[3px] block truncate text-[13.5px] ${part ? '' : 'text-ink-3'}`}>
                  {part ? part.model : current ? `${fitting.length} fit so far` : 'Not yet'}
                </span>
              </span>
              {part?.priceLkr != null && (
                <span className="mono flex-none text-[12px]">{rs(part.priceLkr)}</span>
              )}
            </button>
          )
        })}

        <div className="bg-[var(--sunken)] px-5 pb-5 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="eyebrow">Total so far</span>
            <span className="mono flex-none whitespace-nowrap text-[22px] font-medium tracking-[-0.03em]">
              {rs(report.totalLkr)}
            </span>
          </div>
          <div className="mt-1.5 truncate text-[11.5px] text-ink-3">{shopsLine}</div>
          <button
            type="button"
            onClick={() => show('summary')}
            disabled={filled === 0}
            className="mt-4 min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] text-[14px] font-semibold text-[var(--accent-strong)] transition hover:bg-white disabled:opacity-45"
          >
            See the full build
          </button>
        </div>
      </aside>

      {/* ---- Step or summary ----------------------------------------------- */}
      <main ref={panelRef} className="min-w-0 scroll-mt-[156px] sm:scroll-mt-24">
        {resolved === 'summary' ? (
          <Summary
            build={build}
            report={report}
            shopsLine={shopsLine}
            onChange={(slot) => show(slot)}
            onStartOver={() => {
              setStoredBuild({})
              show('cpu')
            }}
          />
        ) : (
          <>
            {/* Progress and the part just added: the phone's stand-in for the step list. */}
            <div className="mb-4 lg:hidden">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">
                  Step {stepNumber} of {BUILD_SLOTS.length}
                </span>
                <span className="mono text-[12px] text-ink-3">{filled} picked</span>
              </div>
              <div
                className="mt-2 grid gap-1"
                style={{ gridTemplateColumns: `repeat(${BUILD_SLOTS.length}, minmax(0, 1fr))` }}
                aria-hidden
              >
                {BUILD_SLOTS.map((slot) => (
                  <span
                    key={slot}
                    className="h-1.5 rounded-full"
                    style={{
                      background: build[slot]
                        ? SLOT_STYLE[slot].ink
                        : slot === activeSlot
                          ? 'var(--accent)'
                          : 'rgb(30 50 100 / 12%)',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mb-4">
              <span className="eyebrow hidden lg:block">
                Step {stepNumber} of {BUILD_SLOTS.length}
                {isOptionalSlot(activeSlot) ? ' · optional' : ''}
              </span>
              <h2 className="m-0 text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] lg:mt-1.5 lg:text-[30px]">
                {build[activeSlot] ? `Change the ${SLOT_LABEL[activeSlot]}` : `Pick a ${SLOT_LABEL[activeSlot]}`}
              </h2>
              <p className="mt-1.5 text-[14px] leading-[1.45] text-ink-2 lg:text-[15px]">
                {build[activeSlot] ? (
                  <>
                    {build[activeSlot]!.model} is in the build ·{' '}
                    <button
                      type="button"
                      onClick={() => clearSlot(activeSlot)}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      remove it
                    </button>
                  </>
                ) : blocked > 0 ? (
                  <>
                    Showing the <strong className="font-semibold text-ink">{fitting.length}</strong>{' '}
                    that fit what you&apos;ve picked. {blocked} hidden — {firstBlocked}
                  </>
                ) : activeSlot === 'cooling' ? (
                  build.cpu?.socket ? (
                    `Your ${build.cpu.model} uses ${build.cpu.socket}. Most processors that come with a cooler can skip this.`
                  ) : (
                    'Optional. Most processors that come with a cooler can skip this.'
                  )
                ) : suggestion?.slot === activeSlot ? (
                  suggestion.message
                ) : (
                  `${fitting.length} in stock will work`
                )}
              </p>
            </div>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
              <label className="flex h-11 flex-1 items-center gap-2.5 rounded-[var(--radius-sm)] border border-[rgb(30_50_100/11%)] bg-white px-4">
                <span aria-hidden className="text-[14px] text-ink-4">
                  ⌕
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search parts, shops…"
                  aria-label="Search parts and shops"
                  className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-4"
                />
              </label>
              <div className="flex gap-1.5" role="group" aria-label="Sort">
                {(['price', 'name', 'shops'] as Sort[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSort(s)}
                    aria-pressed={sort === s}
                    className={`h-9 flex-none whitespace-nowrap rounded-full border px-3.5 text-[12.5px] transition sm:h-11 sm:rounded-[var(--radius-sm)] sm:px-4 ${
                      sort === s
                        ? 'border-transparent bg-[var(--accent)] font-semibold text-white'
                        : 'border-[var(--glass-border)] bg-white/80 text-ink-2'
                    }`}
                  >
                    {SORT_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass overflow-hidden">
              {items.length === 0 ? (
                <div className="px-5 py-8 text-[13.5px] text-ink-3">
                  {query
                    ? `Nothing matches “${query}”.`
                    : "Nothing in stock fits the parts you've chosen. Try changing another slot."}
                </div>
              ) : (
                items.slice(0, 40).map((o) => {
                  const part = o.part
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
                    part.coolerSockets?.length ? part.coolerSockets.join(', ') : null,
                    part.radiatorMm ? `${part.radiatorMm}mm` : null,
                  ]
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(' · ')

                  return (
                    <div
                      key={part.partId}
                      className={`hairline-b ${selected ? 'bg-[var(--accent-soft)]' : ''}`}
                    >
                      <div className="flex items-center gap-3 px-4 py-3.5 sm:gap-5 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`text-[15px] leading-[1.25] tracking-[-0.015em] ${
                                selected ? 'font-semibold' : 'font-semibold sm:font-normal'
                              }`}
                            >
                              {part.model}
                            </span>
                            <span className="mono hidden flex-none rounded-full bg-[rgb(30_50_100/5%)] px-2 py-[3px] text-[10px] text-ink-2 sm:inline">
                              {part.brand}
                            </span>
                            {selected && (
                              <span className="flex-none text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
                                In build
                              </span>
                            )}
                          </div>
                          <div className="mono mt-1 text-[11.5px] text-ink-3">{specs}</div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="mono text-[15px] tracking-[-0.02em]">
                              {rs(part.priceLkr ?? 0)}
                            </span>
                            <span className="text-[12.5px] text-ink-2">
                              at {part.shop}
                              {part.offers.length > 1 && (
                                <>
                                  {' · '}
                                  <button
                                    type="button"
                                    onClick={() => setExpandedShops(open ? null : part.partId)}
                                    aria-expanded={open}
                                    className="py-1 text-accent underline-offset-2 hover:underline"
                                  >
                                    {open ? 'hide shops' : `${part.offers.length} shops`}
                                  </button>
                                </>
                              )}
                              {' · '}
                              <Link
                                href={`/${activeSlot}/${part.partId}`}
                                aria-label={`All prices and specifications for ${part.model}`}
                                className="py-1 text-ink-3 underline-offset-2 hover:text-accent hover:underline"
                              >
                                Details
                              </Link>
                            </span>
                          </div>
                          {caveat && (
                            <div className="mt-1 text-[12px] leading-snug text-warn">{caveat}</div>
                          )}
                        </div>

                        <button
                          type="button"
                          // More than one shop: the buyer picks which, rather
                          // than being handed the cheapest. One shop: nothing
                          // to decide, so pick it.
                          onClick={() =>
                            part.offers.length > 1
                              ? setExpandedShops(open ? null : part.partId)
                              : choose(activeSlot, part)
                          }
                          aria-label={`Pick ${part.model}`}
                          aria-expanded={part.offers.length > 1 ? open : undefined}
                          className={`${PICK_BUTTON} min-h-11 min-w-[72px]`}
                        >
                          {open ? 'Close' : selected ? 'Keep' : 'Pick'}
                        </button>
                      </div>

                      {open && (
                        <div className="bg-[var(--sunken)] px-4 pb-4 pt-1 sm:px-5">
                          <div className="eyebrow py-2">Pick a shop · cheapest first</div>
                          <div className="flex flex-col gap-1.5">
                            {part.offers.map((offer, i) => {
                              const picked =
                                build[activeSlot]?.partId === part.partId &&
                                build[activeSlot]?.shop === offer.shop
                              return (
                                <button
                                  key={offer.shop}
                                  type="button"
                                  onClick={() => choose(activeSlot, part, offer.shop)}
                                  className={`flex min-h-11 items-center justify-between gap-4 rounded-[10px] border px-3.5 py-2.5 text-left text-[13px] transition ${
                                    picked
                                      ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft)]'
                                      : 'border-transparent bg-white/70 hover:border-[var(--glass-border)]'
                                  } ${offer.inStock ? '' : 'opacity-55'}`}
                                >
                                  <span className="truncate">
                                    {offer.shop}
                                    {i === 0 && offer.inStock && (
                                      <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-[2px] text-[10px] font-semibold text-white">
                                        Cheapest
                                      </span>
                                    )}
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
                  and {items.length - 40} more, cheapest first — narrow it with search.
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              {stepNumber > 1 ? (
                <button
                  type="button"
                  onClick={() => show(BUILD_SLOTS[stepNumber - 2])}
                  className="min-h-11 text-[14px] font-semibold text-ink-2 hover:text-accent"
                >
                  ← {SLOT_LABEL[BUILD_SLOTS[stepNumber - 2]]}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => skip(activeSlot)}
                className="min-h-11 text-[14px] font-semibold text-accent underline-offset-2 hover:underline"
              >
                {build[activeSlot]
                  ? 'Keep it, next →'
                  : isOptionalSlot(activeSlot)
                    ? 'Skip: use the cooler in the box →'
                    : 'Skip this part for now →'}
              </button>
            </div>

            <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-ink-4">
              We check sockets, memory type, power, and that the board fits the case. We don&apos;t
              check whether the graphics card or cooler physically clear it — those measurements
              aren&apos;t published in local listings, so we&apos;d be guessing.
            </p>
          </>
        )}
      </main>

      {/* ---- Pinned total: phones only; desktop has the step list ----------- */}
      {resolved !== 'summary' && (
        <div className="glass-header fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
          <span className="min-w-0">
            <span className="eyebrow block">
              Build so far · {filled} of {BUILD_SLOTS.length}
            </span>
            <span className="mono block text-[20px] font-medium tracking-[-0.03em]">
              {rs(report.totalLkr)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => show('summary')}
            disabled={filled === 0}
            className="min-h-[46px] flex-none rounded-[var(--radius-sm)] border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] px-4.5 text-[14px] font-semibold text-[var(--accent-strong)] disabled:opacity-45"
          >
            Your build
          </button>
        </div>
      )}
    </div>
  )
}

/** The finished build, and what "Your build" opens part-way through. */
function Summary({
  build,
  report,
  shopsLine,
  onChange,
  onStartOver,
}: {
  build: OfferBuild
  report: ReturnType<typeof evaluateBuild>
  shopsLine: string
  onChange: (slot: BuildSlot) => void
  onStartOver: () => void
}) {
  const filled = report.filled.length
  const complete = isBuildComplete(build)
  const worst = report.checks.find((c) => c.status === 'fail')
  const firstEmpty = BUILD_SLOTS.find((s) => !build[s] && !isOptionalSlot(s))

  return (
    <>
      <div className="mb-4">
        <span className={`eyebrow ${complete ? 'text-ok' : ''}`}>
          {filled} of {BUILD_SLOTS.length} picked
        </span>
        <h2 className="m-0 mt-1 text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] lg:text-[30px]">
          Your build
        </h2>
        <p className="mt-1.5 text-[14px] leading-[1.45] text-ink-2 lg:text-[15px]">
          {worst
            ? worst.message
            : complete
              ? `Everything fits. ${shopsLine}.`
              : `${shopsLine}. ${firstEmpty ? `Still to pick: ${SLOT_LABEL[firstEmpty]}.` : ''}`}
        </p>
      </div>

      <section className="glass mb-4 border-2 border-[var(--accent)] p-[18px]">
        <span className="eyebrow block">Total</span>
        <span className="mono mt-1 block text-[32px] font-medium tracking-[-0.03em] text-accent">
          {rs(report.totalLkr)}
        </span>
        {(report.checks.length > 0 || report.pending.length > 0) && (
          <ul className="mt-3 space-y-1.5 border-t border-[var(--hairline)] pt-3">
            {report.checks.map((c) => (
              <li key={c.id} className="flex gap-2 text-[13px] leading-snug">
                <span aria-hidden className={`mt-[6px] h-[7px] w-[7px] flex-none rounded-full ${DOT[c.status]}`} />
                <span className={c.status === 'pass' ? 'text-ink-2' : TONE[c.status]}>{c.message}</span>
              </li>
            ))}
            {report.pending.map((p) => (
              <li key={p.id} className="flex gap-2 text-[13px] leading-snug text-ink-4">
                <span aria-hidden className="mt-[6px] h-[7px] w-[7px] flex-none rounded-full bg-[oklch(0.78_0.02_260)]" />
                <span>{p.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass overflow-hidden">
        {BUILD_SLOTS.map((slot) => {
          const part = build[slot]
          const style = SLOT_STYLE[slot]
          const offer = part?.offers.find((o) => o.shop === part.shop)
          return (
            <div key={slot} className="hairline-b px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px]"
                  style={{ background: style.tint, color: style.ink }}
                >
                  <style.Icon className="h-[21px] w-[21px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="eyebrow block" style={{ color: style.ink }}>
                    {SLOT_LABEL[slot]}
                  </span>
                  {part ? (
                    <>
                      <span className="mt-[2px] block text-[15px] font-semibold leading-[1.25] tracking-[-0.015em]">
                        {part.model}
                      </span>
                      <span className="mono mt-[2px] block text-[14px]">
                        {part.priceLkr != null ? rs(part.priceLkr) : '—'}{' '}
                        <span className="font-sans text-[12.5px] text-ink-2">at {part.shop}</span>
                      </span>
                    </>
                  ) : (
                    <span className="mt-[2px] block text-[14px] text-ink-3">
                      {isOptionalSlot(slot) ? 'Optional · not picked' : 'Not picked'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(slot)}
                  className={part ? 'min-h-11 flex-none px-1.5 text-[13.5px] font-semibold text-accent hover:underline' : `${PICK_BUTTON} min-h-11`}
                >
                  {part ? 'Change' : 'Pick'}
                </button>
              </div>
              {part && offer && (
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[14px] font-semibold text-white transition hover:bg-[var(--accent-strong)] sm:ml-[52px]"
                >
                  Buy at {offer.shop} ↗
                </a>
              )}
            </div>
          )
        })}
      </section>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onStartOver}
          disabled={filled === 0}
          className="min-h-11 rounded-[var(--radius-sm)] px-4 text-[14px] text-ink-2 hover:text-bad disabled:opacity-45"
        >
          Start over
        </button>
      </div>

      <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-ink-4">
        Prices are from the last sync. We check sockets, memory type, power and that the board
        fits the case. We can&apos;t check that the graphics card or cooler physically clears the
        case.
      </p>
    </>
  )
}
