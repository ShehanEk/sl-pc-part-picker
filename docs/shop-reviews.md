# Shop review notes

The home page shows up to 5 short review notes per shop. They live in
`src/lib/shops.ts`, and are refreshed by hand every 3 months. Decision and terms
risk: see "Shop profiles on the home page" in `docs/decisions.md`.

## Quarterly steps

1. Open each shop's Google reviews in Chrome, sorted by newest.
2. Read the reviews from the last 90 days.
3. Draft notes, the review count and the period into `shops.ts`.
4. Shehan checks any shop with few reviews and approves every `check` note.
5. Commit, then one manual Vercel deploy.

## Note rules

- Attributes: warranty, genuine products, customer care, delivery, price and stock.
- Two tones only: `good` and `check`. No scores, stars or negative labels.
- A bad pattern becomes a prompt to the buyer, such as "Check warranty terms before buying."
- Our own words. No quotes and no reviewer names. Never store review text.
- Leave out an attribute reviews don't mention.
- Too few recent reviews: set `reviews: null`, after a manual check. The card then says so.
