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

**Decision.** A reusable `scrape.yml` called by four thin caller workflows, each
on its own staggered cron (19:00, 19:30, 20:00, 20:30 UTC), with `normalize.yml`
at 21:30 UTC.

**Why.** One retailer changing shape should fail only its own run. Staggering
means the four shops are never hit simultaneously by us.

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

### One listing per `(part_id, shop)`, cheapest kept

**Decision.** When a shop lists the same canonical part several times (different
board partners, say), the cheapest wins.

**Why.** The product answers "what does this cost at this shop", and the honest
answer is the lowest price they will sell it at.

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

## Scraping conduct

### robots.txt is respected even where it costs coverage

**Decision.** redlinetech.lk's robots.txt disallows every query-string URL, so
pagination is off limits and only the first 12 products per category are
fetched. That is why it has 44 listings against chamacomputers' 835.

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
