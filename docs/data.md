# What we capture

Retailers, categories, fields, and — as importantly — what is deliberately not
captured. Per-site scraping mechanics live in [retailers.md](retailers.md).

All figures below are from the live database as of the last full run
(2026-08-26).

## Retailers

Six Sri Lankan retailers. All are scraped with plain `fetch`; none needs a
headless browser.

| Shop | Platform | Categories mapped | Listings | In stock | Notes |
|---|---|---|---|---|---|
| [chamacomputers.lk](https://chamacomputers.lk) | Next.js + Sanity | 7 | 835 | 131 | Best-structured source — product objects are embedded as JSON in the RSC payload |
| [pcbuilders.lk](https://pcbuilders.lk) | WordPress + WooCommerce | 7 | 274 | 94 | Only source with a real API; used-parts and open-box stock excluded |
| [nanotek.lk](https://www.nanotek.lk) | Tyno storefront | 7 | 256 | 132 | Prices per payment method; cash price taken as headline |
| [gamestreet.lk](https://www.gamestreet.lk) | Plain PHP | 7 | 212 | 212 * | Cheapest to scrape — one request per category, no pagination |
| [winsoft.lk](https://www.winsoft.lk) | Laravel | 7 | 92 | 87 | **Coverage capped by robots.txt**; bundle-only parts excluded |
| [redlinetech.lk](https://www.redlinetech.lk) | Tyno storefront | 7 | 44 | 43 | **Coverage capped by robots.txt** — first 12 products per category only |

\* **gamestreet's stock figure is a default, not an observation.** Its category
listings carry no stock indicator, so the scraper emits `null` and the normalizer
treats anything that is not explicitly `false` as in stock. Every gamestreet
listing therefore reads as available. Fixing it means a request per product page,
which is the one thing its listing-only scrape currently avoids.

**Why redlinetech is small.** Its robots.txt disallows every query-string URL, so
category pagination is off limits. That is a deliberate compliance choice, not a
scraper bug — see [decisions.md](decisions.md#robotstxt-is-respected-even-where-it-costs-coverage).

**gamestreet.lk currently 403s the GitHub Actions runner** while working from a
local machine. Its data is therefore only as fresh as the last local run. Not
worked around; see [decisions.md](decisions.md#no-user-agent-spoofing).

## Categories

Seven canonical categories. Each retailer's own category labels are mapped onto
these at scrape time, and the retailer's label is kept in the payload so a bad
mapping can be traced.

| Category | Parts | What it means here |
|---|---|---|
| `motherboard` | 311 | |
| `case` | 277 | `form_factor` means the **largest board it accepts** |
| `storage` | 158 | Split by interface: `m2-nvme`, `m2-sata`, `sata` |
| `psu` | 148 | |
| `ram` | 110 | Desktop DIMMs only — SO-DIMM and laptop memory are rejected |
| `cpu` | 90 | |
| `gpu` | 55 | |
| **Total** | **1,149** | across **1,713** listings and **3,301** raw rows |

Retailer categories are not trusted. A motherboard sits in one shop's GPU
listing and a UPS in another's power-supply listing, so an extractor that does
not recognise the claimed category returns `null` rather than forcing the row.

## Captured per listing

Landed verbatim in `raw_listings`, then resolved into `listings`:

| Field | Source | Kept as |
|---|---|---|
| Product title | Page | `raw_title` — the input to identity resolution |
| Price (LKR) | Page | `listings.price_lkr`, and a daily point in `price_history` |
| Price by payment method | Tyno sites | `raw_payload.pricesByMethod`; the cash price becomes the headline |
| Undiscounted / list price | chamacomputers, nanotek | `raw_payload.listPriceLkr` |
| Stock state | Page | `listings.in_stock`. Where a shop does not state it, the row is treated as in stock — see the gamestreet note above. |
| Pre-order flag | chamacomputers | `raw_payload.preOrder` |
| Product URL | Page | `listings.url` — what the buy link points at |
| Retailer's product id | Page | `raw_payload.externalId` |
| Brand | Page | Cross-checked against the title |
| Image URL | Page | `raw_payload.imageUrl` (not currently displayed) |
| Manufacturer spec table | Tyno product pages, when present | `raw_payload.specs` — the source of `recommended_psu_watts`, `power_connector`, `length_mm` |
| Product attribute table | pcbuilders.lk, every product | `raw_payload.specs` — MANUFACTURER, MODEL, RAM - SIZE as structured fields. Landed but not yet read by the normalizer. |
| Backorder flag | pcbuilders.lk | `raw_payload.preOrder`; excluded from `in_stock` — see [retailers.md](retailers.md#gotchas-found-the-hard-way) |
| JSON-LD spec table | winsoft.lk, most products | `raw_payload.specs` — Brand, GPU Chipset, GPU VRAM, Motherboard Chipset, Socket Type. Landed but not yet read by the normalizer. |

## Captured per part

`parts` is the compatibility model. Category-specific columns are nullable and
which apply is decided by `category`.

| Column | Categories | Feeds |
|---|---|---|
| `socket` | cpu, motherboard | Socket check |
| `ram_type` | cpu, motherboard, ram | Memory-generation check |
| `tdp_watts` | cpu, gpu | Power sizing |
| `recommended_psu_watts` | gpu | Power sizing |
| `power_connector` | gpu | Connector check |
| `connectors[]` | psu | Connector check |
| `rated_watts` | psu | Power sizing |
| `efficiency_rating` | psu | Display, and part identity |
| `ram_slots`, `max_ram_gb`, `max_supported_speed_mhz` | motherboard | Memory fit and speed checks |
| `speed_mhz`, `capacity_gb`, `modules` | ram | Memory fit and speed checks |
| `form_factor` | motherboard, case | Board-fits-case check |
| `storage_interface` | storage | Display only — no rule uses it yet |
| `vram_gb` | gpu | Display, and part identity |
| `length_mm` | gpu | Captured, **no rule uses it** — see below |

### Where the values come from

Four sources, in strict order of authority:

0. **Manual overrides** (`part_overrides`), entered through `/admin` and applied
   after everything else on every run. Each row carries a required source note.
   Filling a null only — the mechanism cannot blank a value the pipeline knows.
1. **Curated catalogs** in the repo — 54 GPUs, 86 CPUs, 5 PSUs, each entry
   citing its source. Applied last so they win outright.
2. **The chipset table** — 33 chipsets mapping to socket and memory generation,
   plus derivations from Ryzen / Core / Core Ultra model numbers. This one file
   gives 100% socket coverage on all 90 processors and all 311 boards.
3. **Scraped spec tables** — where a retailer publishes one.

Nothing is inferred. A value that cannot be sourced stays null, and the rule
that needed it answers `unknown`.

Three columns had **no writer at all** until the override table existed:
`ram_slots`, `max_ram_gb` and `max_supported_speed_mhz`. That meant the
`ram-fits` and `ram-speed` checks could never return anything but `unknown`,
whatever parts you picked. Filling them by hand is currently the only way to
switch those two checks on.

### Actual spec coverage

| Category | Parts | socket | ram_type | tdp | rec. PSU | connector | form factor |
|---|---:|---:|---:|---:|---:|---:|---:|
| motherboard | 311 | 311 | 286 | — | — | — | 311 |
| case | 277 | — | — | — | — | — | 156 |
| storage | 158 | — | — | — | — | — | — |
| psu | 148 | — | — | — | — | — | — |
| ram | 110 | — | 110 | — | — | — | — |
| cpu | 90 | 90 | 59 | 86 | — | — | — |
| gpu | 55 | — | — | 49 | 4 | 11 | — |

Reading this table honestly:

- **Sockets and memory generation are solved.** Every processor and every board
  has a socket; the checks that matter most always have an answer.
- **GPU connector data is thin** — 11 of 55 cards, and only 5 supplies have a
  connector list at all. The connector check therefore answers `unknown` far
  more often than it answers anything else. That is the intended behaviour, but
  it makes the check quiet.
- **Case form factor is 156 of 277.** The rest of the cases don't state which
  board sizes they take, so the board-fits-case check declines rather than
  guesses.
- **CPU `ram_type` is 59 of 90** because Intel 600/700-series platforms ship in
  DDR4 and DDR5 variants and the processor doesn't decide it — the board does.
  Null is correct there, not missing.

## Price history

Append-only, one row per `(part, shop, day)`. Re-running on the same day
refreshes that day's price rather than adding a duplicate.

Currently **3,331 points across 4 days** (2026-08-23 → 2026-08-26). Trends need
weeks of nightly runs before they mean anything.

## Deliberately not captured

| Not captured | Why |
|---|---|
| **Warranty period** | Every shop states it differently — some in the title, some in a spec table, some not at all. Capturing it inconsistently would mean showing "1 year" for a part whose neighbour simply didn't say. No `warranty_months` column exists. pcbuilders.lk is the exception and states it on every product, in both the title and `short_description`; that text is kept in `raw_payload.specs` against the day a column exists, but nothing reads it. |
| **Case internal clearance** (max GPU length, max cooler height) | Not published in local listings. Without it, card and cooler clearance cannot be checked, which is why it is named in `UNCHECKED_BY_DESIGN` on the page. |
| **Cooler socket support and height** | Same reason. Coolers are not a tracked category. |
| **Motherboard M.2 slot count and type** | Would be needed to check a drive actually has somewhere to go. Not in listings. |
| **PCIe generation, VRM, chipset feature detail** | Beyond what the compatibility rules ask. |
| **Any personal or account data** | The scrapers read public product pages only. |

`length_mm` is the odd one out: it is captured where a spec table publishes it,
but nothing consumes it, because the case measurement it would be compared
against does not exist. It is kept because it costs nothing and closes half of a
check that could be finished if case data ever improves.
