# Status

What is live and how it is set up. Update this when something ships or a
setting moves. Why each choice was made is in [decisions](decisions.md).

Last updated 20 October 2026.

## Live

- **Site:** [pcprice.lk](https://pcprice.lk). Home, seven category pages with
  filters and a text filter, ~1,350 part pages, search, the PC builder at
  `/build`, and `/privacy`.
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

- **Privacy contact email.** `/privacy` has no Contact section until there is
  an address to publish.
- **Vercel Bot Protection.** Not turned on. Suggested: log-only mode for a week,
  then decide.
- **Vercel connector scope.** The Vercel MCP connector is signed in to a scope
  that cannot read the `shehaneks-projects` team, so Vercel settings are changed
  by hand.
- **`src/queries/parts.ts`** is dead code pending removal.
