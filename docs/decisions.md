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

**2026-10-18 — three shops moved to the desktop app.** gamestreet,
chamacomputers and pcbuilders answer GitHub's runners with 403 on every
category (confirmed for all three in the run logs) and a residential
connection normally. Their workflows lost their
schedules and keep `workflow_dispatch`; `SHOP_SCHEDULE` marks them `ci: false`
and the desktop app runs them at the same slots. The alternative, letting them
fail red every night, would have trained everyone to ignore a red run.

**2026-10-18 — the desktop app defers to CI's run records, not the clock.** It
used to wait two hours past a CI shop's slot and then scrape it. GitHub starts
scheduled runs 2h12m–3h02m late, so the app scraped every CI shop first and CI
skipped it on the lease. Now: CI failed tonight → the app takes over at once;
CI running → leave it; CI not started → wait four hours; and never within 12
hours of the shop's last data.

**Bug that shaped it.** The reusable workflow's input was originally
`timeout-minutes`. GitHub expressions parse the hyphen as subtraction, so the
interpolation was invalid and **no caller workflow ever registered its
schedule**. Renamed to `timeout_minutes`. The lesson: workflow inputs must be
valid identifiers.

### The domain is pcprice.lk, and the site is PCPrice.lk (2026-10-19)

**Decision.** Moved from `sl-pc-part-picker.vercel.app` to `pcprice.lk`, and
renamed the site from "PC Maker.lk" to "PCPrice.lk". The desktop app became
"PCPrice Sync".

**Why.** The name says the main job, finding the price, which "PC Maker" did
not. A `.lk` domain tells Google the site is for Sri Lanka. It was renamed
before Search Console was set up, so no ranking was lost.

**Cost.** Some internal names keep "pcmaker" on purpose: the builder's
`sessionStorage` keys (renaming would drop visitors' builds) and the desktop
app's data folder, `%APPDATA%/PC Maker Sync`, whose encryption key lives beside
`secrets.json`.

### Vercel alone, no Cloudflare in front (2026-10-19)

**Decision.** DNS on Vercel's nameservers; no Cloudflare proxy.

**Why.** Vercel already gives HTTPS, a CDN and DDoS protection, and the pages
are prebuilt, so bots cost little. A proxy in front of Vercel adds a second
dashboard and an SSL mode that can break HTTPS.

**Cost.** Cloudflare's free bot rules are stronger than Vercel's Hobby
firewall. Revisit if bot traffic becomes a real cost; switching needs no code.

### Security headers without a Content-Security-Policy (2026-10-19)

**Decision.** Four headers on every response from `next.config.ts`; no CSP.

**Why.** A real CSP needs a per-request nonce for Next's inline scripts, and
reading one renders every page on demand, which would undo prerendering 1,350
pages.

**Cost.** No defence-in-depth against injected script. The site renders no
user input as HTML, which keeps that risk small.

### Part share images are drawn on demand (2026-10-19)

**Decision.** Home and category share images are prerendered; part images are
made on first request and cached for 30 minutes.

**Why.** Prerendering 1,350 images adds minutes to every deploy, and most are
never fetched: only shared links ask for them.

### Google Analytics with no consent popup (2026-10-20)

**Decision.** GA4 on the production deployment only, with `/privacy` as the
notice its terms require, linked from the footer. No cookie banner.

**Why.** The owner did not want a popup on a site whose whole job is a fast
answer. GA was chosen over Vercel Analytics for its free outbound-click
tracking: clicks out to shops are the number that shows the site's value.

**Cost.** Without consent, visitors who expect to be asked (EU visitors, and
Sri Lanka's PDPA) are not. Revisit if the audience or the law makes it matter.

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

**2026-10-18 — a category that comes back empty also fails the run**, after the
other categories have been written. pcbuilders retired the category id its PSUs
lived under; the old id kept answering with an empty list, so PSUs vanished for
weeks while every run passed, because the shop as a whole still returned rows.

**2026-10-18 — the workflows now use `pipefail`.** The zero-rows check above
did its job, but the workflow piped the scrape through `tee` under `bash -e`
without `pipefail`, so the step took tee's exit code. Three shops then failed
every night for five weeks with every run green. A check that fails the process
is only half the job; the job running it has to notice.

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

### The web admin was removed (2026-10-19)

**Decision.** `/admin` (sync health, missing-spec list, spec editor), its login
and `proxy.ts` are gone. The desktop app is the monitor. `part_overrides` and
`applyOverrides()` stay, so specs already entered keep applying.

**Why.** The desktop app already shows sync health, and runs the shops CI
cannot reach. A second, password-protected UI on the public site was attack
surface and upkeep for one operator.

**Cost.** No way to enter a spec without a code change: new values go in the
curated catalogs and ship with a deploy.

### The admin area is one password (superseded 2026-10-19)

Kept for the record; the admin was removed, see above.

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

### Price history records stock, and the chart plots only in-stock prices

**2026-10-18. Decision.** `price_history` has an `in_stock` column, written
with every daily point, and the part-page chart takes the lowest *in-stock*
price per day.

**Why.** The table recorded a price per shop per day with no stock flag, so the
chart's "lowest price" was often one nobody could pay. An RTX 5070's line ended
at Rs 237,000, chamacomputers' out-of-stock listing, under a headline of
Rs 325,000 in stock. 22% of the history was out-of-stock prices. A caption
admitting it was the stopgap, not the fix.

**Backfill.** Stock cannot be recovered from `price_history` itself, so each old
row was matched to that shop's most recent raw scrape at the same price
(migrations `0004`, then `0005` widening the window to seven days for rows
written days after a shop's last scrape). 739 of 25,308 rows stay NULL, read as
in stock — the rule listings already use for a shop that publishes no stock
status. 732 of them are gamestreet.lk, which published none until 2026-10-18.

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

### Price comparison is the main job; the builder is secondary

**2026-10-18. Decision.** The home page leads with search and the seven
categories, and every page is built around one question: which shop has this
part cheapest? The PC builder moved from `/` to `/build`, reached from an
outlined button in the header, a band on the home page and "Add to my build" on
part pages.

**Why.** Most visitors want one part at the best price, not a whole machine. The
builder made them pick a build slot before they could see a price.

**Consequences.** Category filters run in the browser so the category pages stay
prerendered, and out-of-stock parts stay in their HTML: a category page is the
only crawl path to its part pages. Search is a scan of the directory the pages
already load, not an index; ~1,300 parts does not justify one. `/search` is
`noindex`. One colour per category (`CATEGORY_STYLE`) is shared by every page
and the builder, replacing the builder's own palette.

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

### Category lists filter by text in the browser (2026-10-20)

**Decision.** A text box above each category list filters the rows already on
the page, by word, using the same matching as `/search`.

**Why.** The page already holds every part, so filtering needs no request and
no cost. Reusing `matchesQuery` keeps "Ryzen 7" from matching a Ryzen 5 7500F
here just as it doesn't in search.

### Several spec filters per category, only where the data covers them (2026-10-21)

**Decision.** Each category lists its filter groups in `FACETS`. RAM: memory
type, capacity, speed. Motherboards: socket, memory type, form factor. Drives:
type, capacity. Power supplies: wattage, efficiency. Picks within a group are
OR; across groups, AND.

**Bug that shaped it.** A category could show only one filter, so RAM had
capacity but no DDR4/DDR5, though every kit has its type. Beta users reported
it.

**Why only these.** A filter over a column that is mostly empty hides most of
the list. Each one added covers 77–100% of its category. Processors get no
memory-type filter: LGA1700 chips take either generation, so their type is
unset, and a DDR5 filter would wrongly hide them.

### Deals come from our price history, not the shops' banners (2026-10-22)

**Decision.** A deal is a part whose cheapest in-stock price is at least 5%
under the median of its daily lows over the previous 30 days, with at least 7
of those days on record. Drops over 30% are left out. `/deals` lists them; the
home page shows the top four; the header links to it.

**Why not scrape the shops' offers.** Home-page offers are mostly images, are
vague ("up to 20% off"), break with every redesign, and are the shops' own
artwork. Price history is precise, covers all six shops equally, and is
already loaded by the pages, so deals cost no query.

**Why the 30% cap.** The first real run put an 8GB RTX 5060 Ti, filed under the
16GB card, at the top as "−33%". A deals page promotes matching errors to the
most visible spot, and real discounts that deep are rare.

**Cost.** "Below usual" also catches a newly tracked shop that is simply
cheaper, so the copy never says "price cut". Bundles and bank-card offers are
not captured.

### Phones get their own order, not a squeezed desktop (2026-10-22)

**Decision.** Three phone-only layouts, desktop unchanged:

- **Part page:** the cheapest-in-stock box is rendered twice, above the price
  table below `lg` and in the aside from `lg` up, each copy `display: none` at
  the other size. On phones it had sat 3.7 screens down; it is now on the
  first.
- **Deals:** below `sm` the icon sits beside the name and the price takes one
  line, so a row is ~150px instead of ~240px.
- **Category filters:** below `lg`, a bar pinned to the bottom of the open
  panel shows how many parts match and jumps to them.

**Why render the box twice.** It is the only piece of the aside that moves.
Reordering the whole aside would push the builder card and the spec table above
the prices; `display: contents` to reorder its children is still unreliable for
the accessibility tree. Two copies, one always hidden, is plain and robust.

**Cost.** The box's markup is in the HTML twice. The hidden copy is not in the
accessibility tree, and the text is a dozen words.

### Keyboards, mice and gamepads: one category, major brands only (2026-10-22)

**Decision.** One category, `peripherals`, at `/peripherals`, with Type
(keyboard, mouse, gamepad) and Connection filters. It is a category, not a
build slot: no "Add to build", no builder pitch, and the compatibility checks
never see it. Only titles that *start with* one of Logitech, Razer, Corsair,
SteelSeries, HyperX, ASUS, Glorious, Zowie, Cooler Master, MSI, Xbox,
PlayStation or 8BitDo are kept. Combos, pads, racing wheels and other
accessories are dropped.

**Why one page.** It fits the existing category page unchanged. Three pages
would each rank for their own search, but triple the copy, icons and shop
mappings.

**Why major brands only.** The shelves are mostly budget and no-name lines that
one shop stocks, so there is nothing to compare. The brand must lead the title
because controllers are sold "for PC / Xbox / PS4".

**Why "Wireless" stays in a model name.** A Corsair Katar Pro is Rs 8,000 wired
and Rs 18,000 wireless. The word is dropped only when a named radio
(Lightspeed, HyperSpeed, DualSense) already marks the wireless model. This
splits some ids that should merge, which is a dedup nuisance; merging two
products is a wrong price.

**How the site holds it.** `CATEGORIES` in `src/lib/site.ts` is the browse
list (the build slots plus `peripherals`); `BUILD_SLOTS` stays the builder's.
Scraper mappings now take a list, because five of the six shops split these
across two or three categories.

**Cost.** nanotek files all three on one shelf, so its titles that never say
"mouse" or "keyboard" ("Logitech MX Master 4") are dropped rather than guessed.
Connection is read from the title, so a wireless product the title does not
call wireless shows as Wired.

### Laptops: same maker code, or the same full config (2026-10-23)

**Decision.** `/laptops` lists new laptops from Lenovo, HP, Dell, ASUS, Acer,
MSI, Apple, Gigabyte, Samsung and Microsoft. Two listings are one laptop when
the maker's part number matches (`FA506NCG-HN332WS`, `15-FA2013DX`,
`83FD05TLK`), or failing that when brand, series, processor, graphics, memory
and storage all match. A listing with neither is dropped. Used, refurbished and
open-box machines are dropped, as used parts are. Filters: graphics,
processor family, memory, storage.

**Why strict.** The same model sells in several memory and storage
configurations at different prices. Matching on model alone would compare a
16GB machine's price with an 8GB one's.

**Cost.** nanotek, redlinetech and winsoft titles give model and processor but
not memory or storage, and their product pages do not add them, so few of their
laptops are listed (nanotek 7 of 68 in a sample). Listing them unmerged, priced
at one shop each, was offered and declined on 2026-10-23. A GPU the title does
not name shows as unstated, not as integrated.

### Consoles and handhelds: one fixed name per model (2026-10-23)

**Decision.** `/consoles` covers PlayStation, Xbox and Nintendo consoles and
handheld gaming PCs (Steam Deck, ROG Ally, Legion Go, MSI Claw), with Type and
Platform filters. The name is rebuilt from what the title says
("PlayStation 5" + Slim + Disc + 1TB) rather than cleaned from it, so "PS5" and
"PlayStation 5", or any word order, land on one id. A PS5 Pro drops its storage
from the id, since it only ships with 2TB.

**Cost.** Only three shops sell consoles today (nanotek, chamacomputers,
pcbuilders), about a dozen in all. Laptops, consoles and peripherals have no
place in the PC builder.

### The catalogue is cached per category (2026-10-23)

**Decision.** `loadDirectory` assembles ten cached entries, one per category,
instead of caching the whole catalogue as one.

**Why.** Adding laptops took the single entry to 2.46 MB. Next.js does not
store an entry over 2 MB: the write fails with only a log line, and the stale
entry keeps being served, so the nightly refresh would have stopped updating
prices without anything visibly breaking.

**Cost.** Twenty small queries per refresh instead of two.

### tecroot.lk added; mytechpoint.lk not, behind Cloudflare (2026-10-23)

**Decision.** tecroot.lk is the seventh shop, read through the WooCommerce
Store API flow now shared with pcbuilders.lk (`woocommerce.ts`). mytechpoint.lk
is not added: every automated request gets Cloudflare's JavaScript challenge,
and getting past it would mean defeating bot detection, which this project does
not do (see "No user-agent spoofing"). It can be added if the shop allows our
crawler or sends a feed.

**Bundles.** tecroot sells most consoles with a game. A console listed as a
bundle ("bundle", or "+ game") gets its own id, so a bundle price is never
compared against the console alone.

### Tests are `node:test`, not a framework

**Decision.** 46 tests run via `tsx --test`. No Jest, no Vitest.

**Why.** The only things worth testing here are pure functions; a framework would
be more configuration than test code. Tests derive their expectations from
`BUILD_SLOTS.length` rather than hardcoding a slot count — hardcoding broke them
when storage and case were added.
