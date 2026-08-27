# Decisions

Each entry is a choice that shaped the codebase, why it was made, and what it
costs. Where a decision was forced by a bug, the bug is named — that is usually
the most useful part.

---

## Infrastructure

### Vercel + Neon, not AWS

**Decision.** Next.js on Vercel, Postgres on Neon, scheduled jobs on GitHub
Actions. No container, no VPC, no queue.

**Why.** The requirement was near-zero cost and near-zero operational surface.
The workload is genuinely small: one nightly batch and a read-mostly page over
~1,000 parts. An AWS deployment would have added a bill and an on-call surface
for a project that has neither.

**Cost.** Vendor coupling to Vercel's build and cache behaviour. Acceptable —
nothing here uses a Vercel-only API, so the app is an ordinary Next.js app that
could move.

### Neon over Vercel Postgres and Supabase

**Decision.** Neon serverless Postgres, accessed over HTTP via
`@neondatabase/serverless`.

**Why.** Scale-to-zero matters when the database is idle 23 hours a day. Vercel
Postgres was Neon underneath at the time with less direct control. Supabase
bundles auth, storage and realtime — none of which this needs — and its free
tier pauses in a way that would have made the nightly job flaky.

**Consequence.** The HTTP driver has no transactions across statements, which is
why the normalizer writes in idempotent, chunked upserts rather than one
transaction.

### GitHub Actions, one workflow per retailer

**Decision.** A reusable `scrape.yml` called by six thin caller workflows, each
on its own staggered cron (18:30, 19:00, 19:30, 20:00, 20:30, 21:00 UTC), with
`normalize.yml` at 21:30 UTC.

**Why.** One retailer changing shape should fail only its own run. Staggering
means the shops are never hit simultaneously by us.

**Bug that shaped it.** The reusable workflow's input was originally
`timeout-minutes`. GitHub expressions parse the hyphen as subtraction, so the
interpolation was invalid and **no caller workflow ever registered its
schedule**. Renamed to `timeout_minutes`. The lesson: workflow inputs must be
valid identifiers.

---

## Pipeline

### Scraping and normalization are separate stages with a raw table between them

**Decision.** Scrapers write `raw_listings` verbatim and nothing else. A separate
normalize stage resolves rows to parts.

**Why.** Normalization logic is wrong more often than scraping is, and it is
cheap to fix and rerun — but only if the raw text is still there. Reprocessing
the 2,456 landed rows takes seconds and touches no retailer. Every extractor bug
in this project was fixed that way.

**Cost.** A second table and a second job.

### Deterministic extraction first; the model only sees the residue

**Decision.** Regex/rule extraction runs on every title. A model is consulted
only for rows it returns `null` for, and only in the `gpu` and `psu` categories.

**Why.** Rules are free, instant, and — the real reason — *stable*. The same
title always yields the same `part_id`, so a re-run does not silently re-key half
the catalogue. Deterministic extraction settles the large majority of rows.

**Coverage.** GPU 96%, PSU 96%, CPU 98.8%, motherboard 98.0%, desktop RAM 98.6%,
storage 131/138, case 297/316.

### The model never recalls a specification

**Decision.** The prompt supplies a candidate list and asks the model to pick one
or decline. It is never asked what a part's TDP or socket is.

**Why.** A recalled spec is unverifiable and feeds a hard pass/fail rule.
Choosing among candidates we read off a page is a bounded task with a checkable
answer.

**Declining is a first-class answer.** An unmatched row is a gap; a wrongly
matched row is a wrong price under a real product. Only `confidence: 'high'` is
accepted.

**Bugs that shaped the prompt.**

- It matched "RTX 4070 SUPER" to the plain RTX 4070 at high confidence, reasoning
  that it was the closest available. The prompt now states that variant suffixes
  (SUPER, Ti, XT, XTX) are product-identifying, and that *"the closest match is
  X" is always the wrong answer*.
- "RTX 2000 Ada" and "RTX PRO 2000 Blackwell" collapsed into one part across two
  shops at different prices. Architecture names are now distinguishing, and
  architecture was folded into the GPU `part_id`.

### Specs come from a curated catalog, not from retailer listings

**Decision.** `src/catalog/gpu-specs.ts` (54 entries), `cpu-specs.ts` (86) and
`psu-specs.ts` (5) hold hand-entered specs, each citing its source. Curated
values overwrite anything a retailer's spec table contributed.

**Why.** A TDP is a fact about a chip, not about a shop. Retailer spec tables
are inconsistent, often absent, and describe one board partner's card. Where a
value drives a safety-relevant rule, it needs a citation you can go and check.

**Rules for editing.** Cite the source; never add from memory. Where a model
ships in several power variants, take the **highest** — the wattage rule may be
too strict but must never be too lax. `powerConnector` is omitted rather than
guessed.

### The chipset table instead of per-board lookup

**Decision.** `src/catalog/platforms.ts` maps 33 chipsets to socket and memory
generation, plus three functions deriving the same from CPU model numbers.

**Why.** This is the highest-leverage file in the project. A socket is not a
property of an individual board to be looked up one at a time — it follows from
the chipset. 33 rows give **100% socket coverage on 89 CPUs and 294
motherboards**, and cover boards nobody has listed yet. The GPU catalogue needed
54 hand-written rows to cover one category.

### Sanity checks that fail the run

**Decision.** A scrape throws if it returns zero rows, if no row has a price, or
if more than half the titles look implausible.

**Bug that forced it.** gamestreet.lk started answering the CI runner with 403 on
every category. The run scraped nothing, exited 0, and the nightly job reported
success — data silently stopped arriving and nothing said so. Separately, a bad
selector had every nanotek title come back as the cart total, `"0 LKR"`.

**Principle.** Failing loudly beats landing garbage that looks fine by row count.

### A price floor of 1,000 LKR

**Decision.** Rows priced below 1,000 LKR are not written as listings.

**Why.** Retailers use 0 and 1 for call-for-price and discontinued items.
chamacomputers.lk had seven listings at exactly 1.00 LKR, which would have won
every cheapest-price comparison they appeared in. The cheapest genuine part in
the corpus is a 4,500 LKR supply, so the floor has clearance.

### Manual overrides sit above the curated catalog

**Decision.** `part_overrides` holds hand-entered spec values, and
`applyOverrides()` runs immediately **after** `applyCuratedSpecs()` at the end
of every normalize run. The ladder is now
**manual > curated > scraped > null**.

**Why the ordering is the whole design.** Reverse those two calls and an edit
survives exactly until the next nightly run, then vanishes with nothing to say
it ever existed. `tdp_watts`, `vram_gb` and `connectors` are rewritten
unconditionally by the curated catalog, and the GPU spec patch rewrites four
more columns whenever a retailer publishes a spec table.

**Applied with COALESCE, so a null means "no opinion", never "force null".**
The requirement is filling gaps; a mechanism that could blank a value the
pipeline knows is a mechanism that can silently disable a safety check.

**No foreign key to `parts`.** `foldAliases()` hard-deletes alias part rows,
and an FK with the cascade the rest of the schema uses would take the human's
work with it. Instead the override is repointed onto the canonical part inside
`foldAliases()`, next to the existing listings and price-history repointing.

**Cost.** An override can permanently mask a better value the pipeline later
learns. Mitigated, not solved: every run logs each field where the override
disagrees with what it replaced, and the edit page shows both values.

### The admin area is one password

**Decision.** `ADMIN_PASSWORD` plus an HMAC-signed httpOnly cookie.
`requireAdmin()` in the dashboard layout, `assertAdmin()` at the top of every
Server Action, and `proxy.ts` as a pre-filter.

**Why both checks.** A Server Action compiles to a POST endpoint on the page
that declares it and is reachable by anyone who can send the request. The Next
docs are explicit that rendering a form only on an authenticated page "is not a
security boundary". The layout check stops people seeing the dashboard; only
the check inside the action stops them using it. `proxy.ts` merely keeps
anonymous traffic off the database — it verifies presence, not the signature.

**Rejected.** Vercel Deployment Protection is all-or-nothing per deployment and
would have password-protected the public site. Basic auth in the proxy has no
sign-out and makes the proxy the boundary, which the docs warn against.

**No rate limiting.** A serverless deployment resets in-memory counters on every
cold start, so a counter is theatre. A 32-character random password is the
control.

### An edit may fill an identity-bearing field, never change one

**Decision.** Fields folded into `part_id` by the extractors — GPU memory size,
memory type and board size, PSU wattage and efficiency tier — can be filled when
null but are locked once set.

**Why.** The `part_id` is the public URL. Changing one of these would leave
`/motherboard/asus-prime-b760m-a-ddr4` asserting DDR5. Filling a null is safe
because a null contributed no token to the id in the first place. In practice
this costs nothing: every high-value gap is a null-fill, and every field that
needs genuine correction is not in any id.

### Lowering a safety value requires confirmation

**Decision.** Reducing `tdpWatts`, `recommendedPsuWatts` or `ratedWatts`, or
weakening a power connector, is refused until an explicit confirm box is ticked.

**Why.** It is the one edit that can invert the project's stated safety
property — that a rule may be too strict but must never be too lax. Everything
else in the pipeline enforces that automatically (`mergePatch` resolves toward
the more demanding value); a human is the only actor that can go the other way.

---

## Part identity

### What gets folded into a `part_id`

The `part_id` decides what counts as "the same product across shops". Too coarse
and two different cards share a price; too fine and one card's prices split
across entries. Each inclusion below was added after a real collision:

| Folded in | Collision it fixed |
|---|---|
| GPU memory capacity | "RTX 5090" with no capacity became a separate part from `rtx-5090-32gb`, splitting one card's prices. 45 alias entries fold the historical ones. |
| PSU efficiency tier | ASUS ROG Strix 850W Gold and 850W Platinum collapsed into one part at two very different prices. |
| GPU architecture | "RTX 2000 Ada" and "RTX PRO 2000 Blackwell" collapsed into one part across two shops. |

### Model-name noise patterns must be anchored

**Bug.** A short unanchored pattern intended to strip version suffixes ate the
tail of "CV750", reducing it to "C" and collapsing CV750, CX750 and RM750e into
one part.

**Rule adopted.** Do not add short unanchored patterns to the noise regexes.
Numeric tokens are preserved for cases specifically, because "Thermaltake The
Tower 600" was being reduced to "Thermaltake The".

### One listing per `(part_id, shop)`: in stock first, then cheapest

**Decision.** When a shop lists the same canonical part several times (different
board partners, say), a buyable row beats a cheaper unbuyable one; among equals,
the cheapest wins.

**Why.** It was cheapest-only at first, which reads as obviously right until a
shop carries the same part twice, once in stock and once not. pcbuilders.lk had
an RTX 5070 at 297,000 on backorder and another in stock at 330,000; the lower
number advertised them as the cheapest shop for a card you could not have bought
from them.

The same rule the catalogue query already applied when choosing between shops
now applies within one. Fixing it raised in-stock listings across the board —
nanotek 132 to 143, chamacomputers 131 to 147 — so this was a latent bug in
every shop that a backorder-heavy retailer merely made visible.

---

## Compatibility

### Four statuses, and `unknown` is not a failure

**Decision.** Every check returns `pass`, `fail`, `warn` or `unknown`, with a
message written for a buyer and a `detail` showing the arithmetic.

**Why `unknown` exists.** Most supplies in the catalogue have no published
connector list. Silence is honest; a green tick we cannot justify is not. The UI
shows these greyed rather than hiding them.

### PSU sizing takes the larger of two numbers

**Decision.** Required watts is the greater of the manufacturer's recommendation
and `(GPU TDP + CPU TDP) × 1.3`, rounded up to the next 10W. With no processor
chosen yet, 95W is assumed so the question can still be answered.

**Why.** The manufacturer figure assumes a typical processor and under-reads for
a heavy one; the computed figure ignores platform draw the manufacturer
accounted for. The maximum is the only choice that is wrong in the safe
direction.

### The graphics card is chosen before the power supply

**Decision.** `suggestNextSlot` orders GPU before PSU, always.

**Why.** Caught in review — the original order went processor, board, memory,
supply, card. How much power a build needs *depends on the card*, so sizing the
supply first means sizing it against a draw that is about to change, and a supply
picked for a bare processor is usually too small once a card goes in. Tests pin
the ordering.

### Physical fit is not checked, and the app says so

**Decision.** `UNCHECKED_BY_DESIGN` lists card and cooler clearance, cooler
socket support and height, and storage connector availability. It is rendered on
the page.

**Why.** Physical fit is the most common way a real build fails, and none of it
is published in local listings. Guessing would be worse than not answering.
Saying so is the honest alternative to a silence that reads as approval.

The one physical check the data does support — whether the board fits the case —
is implemented, using a single "largest board accepted" value plus an ordering
(ITX < mATX < ATX) rather than a list of supported sizes.

---

### Parts a shop will not sell separately are excluded

**Decision.** winsoft.lk marks some parts "(SYSTEM ONLY)" or "(Not Sold
Separately)". Those rows are dropped.

**Why.** The price is real but unbuyable on its own, so listing it would
undercut every shop that will actually sell you the part. Same family as the
used-stock and backorder decisions below: a number you cannot act on is worse
than a gap.

**Bug it caused.** Matching only the first phrasing let a "Crucial 32GB DDR5
5600MHz Desktop RAM (Not Sold Separately)" through. The other three carrying
that label were laptop memory, which the extractor rejects anyway — so one
missed phrasing cost exactly one bad row, and it took reading the *rejected*
titles to notice it at all.

### Used and open-box stock is excluded

**Decision.** pcbuilders.lk keeps a parallel `all-used-items` category tree —
used graphics cards, processors, boards, memory, supplies. None of it is
scraped, and open-box items listed among new stock are filtered on the title.

**Why.** A used card at half price would win every comparison it appeared in,
against new stock, with nothing on the row to say why. The site has no concept
of condition, and inventing a price advantage that rests on one is worse than
the missing coverage.

**Consequence.** If condition ever becomes a first-class field, this is the
decision to revisit — the data is there and deliberately left on the shelf.

### Backorder is not stock

**Decision.** For pcbuilders.lk, `in_stock` is `is_in_stock && !is_on_backorder`.

**Why.** WooCommerce reports `is_in_stock: true` for backordered items. 206 of
its 319 products are "Available on backorder", so taking the flag at face value
would have made it the shop that stocks everything and let it win every
cheapest-in-stock comparison with parts that have to be ordered in.

---

## Scraping conduct

### robots.txt is respected even where it costs coverage

**Decision.** redlinetech.lk's robots.txt disallows every query-string URL, so
pagination is off limits and only the first 12 products per category are
fetched. That is why it has 44 listings against chamacomputers' 835.

winsoft.lk is the same bind and worse — it disallows query strings *and* path
pagination, so there is no second route through a listing at all. Rather than
settle for 12 per category, discovery there is the union of the category pages
and the (months-stale) sitemap, neither of which contains the other. That
recovers a good deal without touching a disallowed URL: graphics cards went
from 12 to 19, and the shop as a whole from 87 to 111 products. Still partial,
and documented as partial.

**Why.** The cheap workaround exists and was not taken. If fuller coverage
matters, the route is to ask the shop for permission or a feed.

### No user-agent spoofing

**Decision.** Requests identify as `SLPCPartsTrackerBot/0.1` with a link to the
repo. When gamestreet.lk began answering the GitHub runner with 403, spoofing a
browser was declined.

**Why.** A 403 is an access control. Evading it converts a compliance record the
project can defend into one it cannot, over one of four data sources.

### Requests are serialised per host with a 1.5s floor

**Bug that shaped it.** GitHub Actions substitutes an unset repository variable
as `""`, not `undefined`, and `""` is not nullish. Reading the delay with `??`
therefore produced `Number("")` — **zero** — which would have removed every gap
between requests on the first unattended run against four real shops. The
override is now read through a helper that treats empty as absent, and only a
positive finite value is honoured.

---

## Product and interface

### The build lives in the browser, not the URL

**Decision.** Build state is React state. No search params.

**Why.** The URL version was a source of bugs and read badly. `hydrateBuild`
treated *every* search param as a slot, so clicking any row sent the literal
string `"slot"` into a Postgres enum and crashed the page.

**Verification lesson from that bug.** It was missed because testing drove URLs
with part params directly and never clicked, so the offending params were never
produced. Interactions get exercised by clicking now.

### The whole catalogue ships to the client

**Decision.** `loadCatalogue()` returns all 1,046 parts with their offers, and
the page is statically prerendered with a 30-minute revalidate.

**Why.** The catalogue is small and changes once a night. Every interaction would
otherwise be a round trip for data the browser already holds. The rules are pure
functions and run identically on either side.

### Light-only glass design

**Decision.** The interface pins `color-scheme: light`.

**Why.** The look depends on frosted white panels over a pale gradient with a
blue bloom. There is no dark equivalent that keeps the same feel, and a bad
inversion is worse than no dark mode — an earlier iteration shipped a dropdown
that rendered white-on-white in dark mode.

### Tests are `node:test`, not a framework

**Decision.** 46 tests run via `tsx --test`. No Jest, no Vitest.

**Why.** The only things worth testing here are pure functions; a framework would
be more configuration than test code. Tests derive their expectations from
`BUILD_SLOTS.length` rather than hardcoding a slot count — hardcoding broke them
when storage and case were added.
