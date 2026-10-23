# Architecture

## What this is for

A buyer in Sri Lanka cannot use PCPartPicker to buy a PC. It knows every part
ever made and none of the local prices, so a compatible build on it is often a
build nobody here stocks. This project inverts that: a small catalogue of only
what seven Sri Lankan retailers actually have, with the compatibility checking that
makes the catalogue usable.

Two things follow from that premise and shape everything below.

**Mixing shops is the point.** No single retailer carries a whole build at good
prices. Every part therefore carries *all* the shops selling it, and the build
total is a sum across shops rather than a basket at one.

**Compatibility answers must be deterministic.** A wrong "your PSU is fine" is a
build that doesn't boot or a part that burns. So the rules are pure functions
over plain objects, with no model in the path — the one place a model is used is
matching messy listing titles at ingest, where a mistake costs a missing row
rather than a dead motherboard.

## The shape of it

```mermaid
flowchart TB
  subgraph shops["Seven retailer sites"]
    S1["gamestreet.lk"]
    S2["chamacomputers.lk"]
    S3["nanotek.lk"]
    S4["redlinetech.lk"]
    S5["pcbuilders.lk"]
    S6["winsoft.lk"]
    S7["tecroot.lk"]
  end

  subgraph ci["GitHub Actions — nightly, staggered"]
    SC["scrape job x3"]
    NO["normalize job"]
  end

  subgraph db["Neon Postgres"]
    RAW["raw_listings"]
    P["parts"]
    L["listings"]
    H["price_history"]
  end

  subgraph app["Next.js on Vercel"]
    Q["query layer + unstable_cache"]
    PAGE["home, category and part pages — static, 30m revalidate"]
    CFG["PC builder at /build — client"]
  end

  CAT["curated spec catalogs<br/>in the repo"]

  shops --> SC --> RAW
  RAW --> NO
  NO --> P
  NO --> L
  NO --> H
  CAT --> NO
  P --> Q
  L --> Q
  Q --> PAGE --> CFG
```

Three runtimes, deliberately: the site never scrapes, and the scrapers never
serve a request. A retailer changing its markup can break tonight's ingest
without touching what a visitor sees.

## Module map

| Path | Responsibility |
|---|---|
| `src/scrapers/` | One module per retailer. pcbuilders and tecroot read the WooCommerce Store API through the shared `woocommerce.ts`; the rest parse HTML. Emits `ScrapedRow` and nothing more — no part matching, no spec parsing. `tyno.ts` is a shared fetch flow for the two Tyno storefronts; their parsers stay separate. |
| `src/lib/http.ts` | The only HTTP client. Serialises requests per host, 1.5s floor, bounded retries. |
| `src/pipeline/scrape.ts` | Runs a scraper, sanity-checks the result, lands rows in `raw_listings`. |
| `src/normalize/extract.ts` | Deterministic title → part identity for all ten categories. Returns `null` freely. Peripherals, laptops and consoles keep only the major brands listed in the file; laptops also need a maker code or a full config. |
| `src/normalize/ai.ts` | The only model call in the codebase. Chooses among supplied candidates; never recalls specs. |
| `src/catalog/platforms.ts` | Chipset → socket + memory generation. 33 rows cover every board and CPU in the catalogue. |
| `src/catalog/*-specs.ts` | Curated, source-cited specs: 54 GPUs, 86 CPUs, 5 PSUs. |
| `src/catalog/apply.ts` | Pushes curated specs onto `parts`, folds alias part_ids. |
| `src/pipeline/normalize.ts` | Resolves raw rows to parts, writes `listings` and `price_history`. |
| `src/compat/rules.ts` | Pairwise checks. Pure. `pass` / `fail` / `warn` / `unknown`. |
| `src/compat/build.ts` | Build-level evaluation, candidate ranking, next-slot suggestion. Pure. |
| `src/queries/build.ts` | Loads the whole catalogue for the PC builder, cached 30 min. |
| `src/lib/search.ts` | Part search over the cached directory, by word. No index. |
| `src/app/` | The public site: home (`/`), category pages, part pages, `/deals`, search (`/search`), the PC builder (`/build`) and `/privacy`. |
| `src/lib/site.ts` | Site identity and per-category copy. `CATEGORIES` is every browsable category (the build slots plus `peripherals`, `laptops` and `consoles`); the builder uses `BUILD_SLOTS` from `src/compat/build.ts`. |
| `src/app/components/CategoryList.tsx` | A category's list with its filters, sort and text filter, all in the browser. The text filter reuses `matchesQuery` from `src/lib/search.ts`. Which spec filters a category shows is the `FACETS` map in `src/app/[category]/page.tsx`. |
| `src/lib/deals.ts` | Finds parts below their usual price from the cached directory and price index. Pure; no query of its own. Feeds `/deals` and the home page strip, rendered by `src/app/components/Deals.tsx`. |
| `src/lib/og.tsx` + `opengraph-image.tsx` files | Share images (1200 × 630) for home, each category and each part, drawn by `next/og` with the site fonts in `assets/fonts/`. |
| `src/app/components/Analytics.tsx` | Google Analytics 4, loaded only when `VERCEL_ENV` is `production`. |
| `src/app/api/revalidate/route.ts` | Clears the `catalog` cache tag. Called by the nightly normalize workflow with a bearer token. |
| `next.config.ts` | Security headers on every response, and the permanent redirect from `sl-pc-part-picker.vercel.app` to `pcprice.lk`. |
| `scripts/favicon.mjs` | Generates the favicon, SVG icon and Apple icon from one SVG. |
| `src/queries/admin.ts` | Uncached sync-health reads for the desktop app's monitor. |
| `src/catalog/overrides.ts` | Applies hand-entered values (`part_overrides`) on top of everything the pipeline produced. |

`src/queries/parts.ts` is no longer imported by anything — it served the earlier
part-detail UI and is dead code pending removal.

## Data model

Four tables (`src/db/schema.ts`):

- **`parts`** — one row per canonical part, keyed by a synthesised `part_id`
  (`rtx-5070-12gb`, `ryzen-5-5600`). Category-specific columns are nullable;
  which apply is decided by `category`. This is the compatibility model.
- **`raw_listings`** — every scraped row, verbatim, never mutated except to
  stamp `normalized_at`. This is what makes ingest reprocessable.
- **`listings`** — one row per `(part_id, shop)`, overwritten each run. Current
  price and stock.
- **`price_history`** — append-only, one row per `(part_id, shop, day)`, with
  the day's stock status so the chart can plot buyable prices only.

The `part_id` is the join between a shop's marketing text and a compatibility
fact, and getting it wrong is the failure mode that matters: too coarse and two
different cards share a price, too fine and one card's prices split across
entries. Several fields are folded into it deliberately — memory capacity on
GPUs, efficiency tier on PSUs, architecture on workstation cards — each after a
real collision. See [decisions](decisions.md#part-identity).

## Rendering and caching

The builder page (`/build`) is **statically prerendered with a 30-minute revalidate**. The entire
catalogue (1,046 parts with their offers) is serialised into the payload and
handed to the client, and the builder filters it in the browser. The home,
category and part pages are prerendered the same way; only `/search` renders
per request.

That is unusual and it is the right trade here. The catalogue is ~1,000 parts,
not a million; it changes once a night; and every interaction — picking a part,
switching shop, re-filtering after a choice — would otherwise be a round trip
for data the browser already has. The compatibility rules are pure functions, so
they run identically on either side. The build itself lives in React state and
never touches the URL or the server.

Query results are wrapped in `unstable_cache` with `revalidate: 1800` and the
tag `'catalog'`. The nightly normalize workflow clears that tag through
`/api/revalidate` when it finishes, so new prices show within a minute rather
than up to 30 minutes later.

Share images: home and the ten category images are made at build. The 1,350
part images are drawn on first request and cached, because prerendering them
all would add minutes to every deploy for images that are mostly never fetched.

## Hosting, domain and analytics

- **Domain:** `pcprice.lk`, registered with the LK Domain Registry, nameservers
  pointed at Vercel. `www.pcprice.lk` and `sl-pc-part-picker.vercel.app` both
  redirect permanently (308) to it. Canonicals, the sitemap and share images
  take the host from `SITE_URL` in `src/lib/site.ts`.
- **Security headers:** `nosniff`, `X-Frame-Options: DENY`,
  `strict-origin-when-cross-origin` and a `Permissions-Policy`, from
  `next.config.ts`. Vercel adds HSTS. There is no Content-Security-Policy; see
  [decisions](decisions.md#security-headers-without-a-content-security-policy-2026-10-19).
- **Analytics:** Google Analytics 4, production only, no consent popup.
  `/privacy` is the notice GA's terms require. Clicks out to shops come from GA's
  enhanced measurement, not from code.
- **Search:** the domain is verified in Google Search Console and the sitemap
  is submitted.

## Known gaps

These are real and listed so they don't have to be rediscovered.

- **gamestreet.lk, chamacomputers.lk and pcbuilders.lk depend on the desktop
  app.** They block GitHub's runners, so their workflows are manual-only and the
  app scrapes them nightly. If the app is not running, those three go stale;
  the desktop app's dashboard shows how far behind they are.
- **gamestreet.lk answers the GitHub runner with 403** while working fine
  locally. Not worked around: spoofing a browser user-agent would be evading an
  access control. The options are to ask the shop, retest later, or drop to
  three shops.
- **PSU connector coverage is 5 units.** Most `gpu-connector` checks therefore
  answer `unknown` rather than `pass`. That is the honest result, but it makes
  the check quiet.
