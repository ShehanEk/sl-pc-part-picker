import { SHOP_PROFILES, type ShopNote } from '@/lib/shops'
import type { ShopStats } from '@/lib/shop-stats'
import { TRACKED_SHOPS } from '@/lib/site'

const LINK = 'inline-flex min-h-11 flex-none items-center text-accent hover:underline sm:min-h-0'

const TONE: Record<ShopNote['tone'], { dot: string; ink: string }> = {
  good: { dot: '#0f7a4f', ink: 'text-ink-2' },
  check: { dot: '#c07a00', ink: 'text-[#7a5000]' },
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="mono text-[16px] font-medium tracking-[-0.02em] sm:text-[17px]">{value}</span>
      <span className="text-[11.5px] text-ink-2">{label}</span>
    </span>
  )
}

/** A sideways row of shop cards. Nothing moves unless the visitor scrolls it. */
export function ShopProfiles({ stats }: { stats: Record<string, ShopStats> }) {
  return (
    <section aria-labelledby="shops" className="flex flex-col gap-4 pb-14">
      <div className="flex flex-col gap-1.5">
        <h2 id="shops" className="text-[22px] font-semibold tracking-[-0.02em]">
          Know the shop before you buy.
        </h2>
        <p className="m-0 max-w-[70ch] text-[15px] leading-[1.5] text-ink-2">
          What our own price checks show, and what recent Google reviews mention most. Summarised by
          us every 3 months.
        </p>
      </div>

      <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:gap-3.5 sm:px-0">
        {TRACKED_SHOPS.map((shop) => {
          const profile = SHOP_PROFILES[shop]
          const { parts, inStockPct, cheapestPct } = stats[shop]
          return (
            <li
              key={shop}
              className="glass flex w-[300px] flex-none snap-start flex-col gap-3.5 p-[18px] sm:w-[372px] sm:p-5"
            >
              <div className="flex items-center justify-between gap-2.5">
                <h3 className="mono m-0 text-[15px] font-medium tracking-[-0.02em] sm:text-[16px]">{shop}</h3>
                <a href={profile.website} target="_blank" rel="noopener" className={`${LINK} text-[13px] font-semibold`}>
                  Visit site ↗
                </a>
              </div>

              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[rgb(240_243_250/70%)] px-2.5 py-3 sm:gap-2 sm:p-3">
                <Stat value={parts.toLocaleString('en-LK')} label="parts listed" />
                <Stat value={inStockPct === null ? '–' : `${inStockPct}%`} label="in stock" />
                <Stat value={cheapestPct === null ? '–' : `${cheapestPct}%`} label="cheapest on" />
              </div>

              {profile.branches.length > 0 && (
                <div className="flex flex-col sm:gap-1.5">
                  <span className="eyebrow text-[11px]">Branches</span>
                  {profile.branches.map((b) => (
                    <span key={b.name} className="flex items-center justify-between gap-2.5 text-[13.5px]">
                      <span>{b.name}</span>
                      <a href={b.mapsUrl} target="_blank" rel="noopener" className={`${LINK} text-[13px]`}>
                        Open in Maps
                      </a>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
                <span className="eyebrow text-[11px]">Recent reviews mention</span>
                {profile.reviews ? (
                  <>
                    <ul className="flex flex-col gap-[7px]">
                      {profile.reviews.notes.map((n) => (
                        <li key={n.attribute} className="flex gap-[9px] text-[13px] leading-[1.4]">
                          <span
                            aria-hidden
                            className="mt-[5px] h-[7px] w-[7px] flex-none rounded-full"
                            style={{ background: TONE[n.tone].dot }}
                          />
                          <span className={TONE[n.tone].ink}>
                            <strong className="font-semibold">{n.attribute}.</strong> {n.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <span className="text-[12px] leading-[1.45] text-ink-2">
                      From {profile.reviews.count} Google reviews, {profile.reviews.period}
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] leading-[1.45] text-ink-2">
                    Not enough recent reviews to summarise.
                  </span>
                )}
                <a href={profile.reviewsUrl} target="_blank" rel="noopener" className={`${LINK} self-start text-[13px] font-semibold`}>
                  Read them on Google ↗
                </a>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
