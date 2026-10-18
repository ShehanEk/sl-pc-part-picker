-- Second pass of the in_stock backfill from 0004, for the rows it left NULL.
-- 0004 matched only a scrape from the same day or the day before, which missed
-- price points written days after a shop's last scrape (an RTX 5070 at
-- chamacomputers.lk kept an unbuyable Rs 237,000 as "unknown" that way). Here
-- the most recent scrape from that shop at that price within the previous seven
-- days decides. Measured before running: 241 of 980 resolved, 208 out of stock.
UPDATE "price_history" AS h
SET "in_stock" = latest.s
FROM (
  SELECT DISTINCT ON (h2.part_id, h2.shop, h2.recorded_on)
         h2.part_id, h2.shop, h2.recorded_on,
         (rl.raw_payload->>'inStock')::boolean AS s
  FROM "price_history" h2
  JOIN "raw_listings" rl
    ON rl.shop = h2.shop
   AND rl.scraped_at::date BETWEEN h2.recorded_on - 7 AND h2.recorded_on
   AND (rl.raw_payload->>'priceLkr')::numeric = h2.price_lkr
   AND rl.raw_payload->>'inStock' IS NOT NULL
  WHERE h2.in_stock IS NULL
  ORDER BY h2.part_id, h2.shop, h2.recorded_on, rl.scraped_at DESC
) AS latest
WHERE h.part_id = latest.part_id AND h.shop = latest.shop
  AND h.recorded_on = latest.recorded_on AND h.in_stock IS NULL;
