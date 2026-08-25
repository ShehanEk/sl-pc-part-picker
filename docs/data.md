# What we capture

Retailers, categories, fields, and — as importantly — what is deliberately not
captured. Per-site scraping mechanics live in [retailers.md](retailers.md).

All figures below are from the live database as of the last full run
(2026-08-24).

## Retailers

Four Sri Lankan retailers. All are scraped with plain `fetch`; none needs a
headless browser.

| Shop | Platform | Categories mapped | Listings | In stock | Notes |
|---|---|---|---|---|---|
| [chamacomputers.lk](https://chamacomputers.lk) | Next.js + Sanity | 7 | 835 | 131 | Best-structured source — product objects are embedded as JSON in the RSC payload |
| [nanotek.lk](https://www.nanotek.lk) | Tyno storefront | 7 | 256 | 132 | Prices per payment method; cash price taken as headline |
| [gamestreet.lk](https://www.gamestreet.lk) | Plain PHP | 7 | 212 | 212 * | Cheapest to scrape — one request per category, no pagination |
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
| `motherboard` | 294 | |
| `case` | 231 | `form_factor` means the **largest board it accepts** |
| `psu` | 148 | |
| `storage` | 121 | Split by interface: `m2-nvme`, `m2-sata`, `sata` |
| `ram` | 108 | Desktop DIMMs only — SO-DIMM and laptop memory are rejected |
| `cpu` | 89 | |
| `gpu` | 55 | |
| **Total** | **1,046** | across **1,347** listings and **2,456** raw rows |

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

Three sources, in strict order of authority:

1. **Curated catalogs** in the repo — 54 GPUs, 86 CPUs, 5 PSUs, each entry
   citing its source. Applied last so they win outright.
2. **The chipset table** — 33 chipsets mapping to socket and memory generation,
   plus derivations from Ryzen / Core / Core Ultra model numbers. This one file
   gives 100% socket coverage on all 89 processors and all 294 boards.
3. **Scraped spec tables** — where a retailer publishes one.

Nothing is inferred. A value that cannot be sourced stays null, and the rule
that needed it answers `unknown`.

### Actual spec coverage

| Category | Parts | socket | ram_type | tdp | rec. PSU | connector | form factor |
|---|---:|---:|---:|---:|---:|---:|---:|
| motherboard | 294 | 294 | 270 | — | — | — | 294 |
| case | 231 | — | — | — | — | — | 132 |
| psu | 148 | — | — | — | — | — | — |
| storage | 121 | — | — | — | — | — | — |
| ram | 108 | — | 108 | — | — | — | — |
| cpu | 89 | 89 | 58 | 86 | — | — | — |
| gpu | 55 | — | — | 49 | 4 | 11 | — |

Reading this table honestly:

- **Sockets and memory generation are solved.** Every processor and every board
  has a socket; the checks that matter most always have an answer.
- **GPU connector data is thin** — 11 of 55 cards, and only 5 supplies have a
  connector list at all. The connector check therefore answers `unknown` far
  more often than it answers anything else. That is the intended behaviour, but
  it makes the check quiet.
- **Case form factor is 132 of 231.** The rest of the cases don't state which
  board sizes they take, so the board-fits-case check declines rather than
  guesses.
- **CPU `ram_type` is 58 of 89** because Intel 600/700-series platforms ship in
  DDR4 and DDR5 variants and the processor doesn't decide it — the board does.
  Null is correct there, not missing.

## Price history

Append-only, one row per `(part, shop, day)`. Re-running on the same day
refreshes that day's price rather than adding a duplicate.

Currently **1,618 points across 2 days** (2026-08-23 → 2026-08-24). Trends need
weeks of nightly runs before they mean anything.

## Deliberately not captured

| Not captured | Why |
|---|---|
| **Warranty period** | Every shop states it differently — some in the title, some in a spec table, some not at all. Capturing it inconsistently would mean showing "1 year" for a part whose neighbour simply didn't say. No `warranty_months` column exists. |
| **Case internal clearance** (max GPU length, max cooler height) | Not published in local listings. Without it, card and cooler clearance cannot be checked, which is why it is named in `UNCHECKED_BY_DESIGN` on the page. |
| **Cooler socket support and height** | Same reason. Coolers are not a tracked category. |
| **Motherboard M.2 slot count and type** | Would be needed to check a drive actually has somewhere to go. Not in listings. |
| **PCIe generation, VRM, chipset feature detail** | Beyond what the compatibility rules ask. |
| **Any personal or account data** | The scrapers read public product pages only. |

`length_mm` is the odd one out: it is captured where a spec table publishes it,
but nothing consumes it, because the case measurement it would be compared
against does not exist. It is kept because it costs nothing and closes half of a
check that could be finished if case data ever improves.
