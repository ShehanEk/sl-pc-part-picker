ALTER TABLE "price_history" ADD COLUMN "in_stock" boolean;--> statement-breakpoint
-- Hand-written backfill: stock for the rows recorded before this column existed.
-- price_history has no link to raw_listings, so each row is matched to that
-- shop's scrape on the same day or the day before, at the same price. Any
-- in-stock match counts as in stock. Rows with no match, or whose shop gave no
-- stock flag, stay NULL and are read as in stock, as listings already are.
-- Measured before running: 18,886 in stock, 5,442 out of stock, 980 unknown.
UPDATE "price_history" AS h
SET "in_stock" = m.any_in
FROM (
  SELECT h2.part_id, h2.shop, h2.recorded_on,
         bool_or((rl.raw_payload->>'inStock')::boolean)
           FILTER (WHERE rl.raw_payload->>'inStock' IS NOT NULL) AS any_in
  FROM "price_history" h2
  JOIN "raw_listings" rl
    ON rl.shop = h2.shop
   AND rl.scraped_at::date BETWEEN h2.recorded_on - 1 AND h2.recorded_on
   AND (rl.raw_payload->>'priceLkr')::numeric = h2.price_lkr
  GROUP BY 1, 2, 3
) AS m
WHERE h.part_id = m.part_id AND h.shop = m.shop AND h.recorded_on = m.recorded_on
  AND m.any_in IS NOT NULL;
