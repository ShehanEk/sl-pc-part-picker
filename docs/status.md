# Status

What is live and how it is set up. Update this when something ships or a
setting moves. Why each choice was made is in [decisions](decisions.md).

Last updated 22 October 2026.

## Live

- **Site:** [pcprice.lk](https://pcprice.lk). Home, eight category pages with
  filters and a text filter, ~1,500 part pages, `/deals`, search, the PC
  builder at `/build`, and `/privacy`.
- **Deals:** parts at least 5% below their 30-day usual price, on `/deals`, as
  the top four on the home page, and linked from the header.
- **Phones:** checked at 375px on 22 October 2026. No page scrolls sideways.
  Part pages show the cheapest shop on the first screen, deal rows are compact,
  and open category filters have a "Show N results" bar.
- **Category filters:** RAM by memory type, capacity and speed; motherboards by
  socket, memory type and form factor; drives by type and capacity; power
  supplies by wattage and efficiency; GPUs, processors and cases by one spec
  each; keyboards, mice and gamepads by type and connection. Plus stock, brand
  and shop everywhere.
- **Keyboards, mice and gamepads** at `/peripherals` (22 October 2026): major
  brands only, from all six shops. Not part of the PC builder.
- **Share images** for home, categories and parts (WhatsApp, Facebook, X, and
  the Product image Google reads from structured data).
- **Favicon:** a processor with "Rs" on it. Regenerate with
  `node scripts/favicon.mjs`.
- **Desktop app:** "PCPrice Sync", the sync monitor and the scraper for the
  three shops GitHub's runners cannot reach. The web admin was removed.

## Setup outside the repo

| What | Where | State |
|---|---|---|
| Domain `pcprice.lk` | LK Domain Registry, Standard package, expires 2027-10-19 | Nameservers on Vercel |
| `www` → apex | Vercel → Domains | Permanent (308) |
| Nightly cache clearing | GitHub Actions secret `REVALIDATE_SECRET`, variable `SITE_URL`; Vercel `REVALIDATE_SECRET` (Production) | Working; endpoint tested |
| Google Analytics | Property `G-GXGFL8QEKV`, enhanced measurement on | Live, production only |
| Google Search Console | Domain property, TXT record in Vercel DNS | Verified; sitemap read successfully |

## Open items

- **Wrong RTX 5060 Ti listing.** gamestreet.lk's 8GB card was filed under
  `rtx-5060-ti-16gb` before the "8GBB" fix. Its `listings` row goes stale within
  7 days, or delete it: `delete from listings where part_id = 'rtx-5060-ti-16gb'
  and shop = 'gamestreet.lk';`. Its old `price_history` rows still pull that
  part's chart low.

- **Privacy contact email.** `/privacy` has no Contact section until there is
  an address to publish.
- **Vercel Bot Protection.** Not turned on. Suggested: log-only mode for a week,
  then decide.
- **Vercel connector scope.** The Vercel MCP connector is signed in to a scope
  that cannot read the `shehaneks-projects` team, so Vercel settings are changed
  by hand.
- **`src/queries/parts.ts`** is dead code pending removal.
