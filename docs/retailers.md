# Retailer inspection

Hand-inspection of each retailer before writing scraper code, per the project
spec. Re-check this page whenever a scraper starts failing — the usual cause is
one of these sites changing shape.

Last inspected: 2026-08-23. pcbuilders.lk added 2026-08-25, winsoft.lk 2026-08-26.

## Summary

| Retailer | Platform | Prices in initial HTML? | Requests per product | robots.txt |
|---|---|---|---|---|
| gamestreet.lk | Plain PHP | **Yes**, on category listings | ~0 (whole category in 1 request) | No directives at all |
| chamacomputers.lk | Next.js + Sanity | **Yes**, as JSON in the RSC payload | ~0 (12 products per page request) | Allows all but `/api`, `/privacy`, `/cart`, `/survey` |
| nanotek.lk | Tyno storefront | No — loaded by XHR | 3 | Only disallows `/admin` |
| redlinetech.lk | Tyno storefront | No — loaded by XHR | 3 | **Disallows every query-string URL** |
| pcbuilders.lk | WordPress + WooCommerce | **Yes**, as JSON from the Store API | ~0 (100 products per request) | Allows all but `/cart/`, `/checkout/`, `/my-account/`, add-to-cart |
| winsoft.lk | Laravel | **Yes**, as JSON-LD on the product page | 1 | **Disallows every query string AND path pagination** |
| winsoft.lk | Laravel | **Yes**, as JSON-LD on the product page | 1 | **Disallows every query string AND path pagination** |

None needs a headless browser. All are reachable with plain `fetch`.

## gamestreet.lk

Cheapest to scrape. Category listings are server-rendered with title, brand and
price together, and there is no pagination — one request returns the full
listing.

- Categories: `products.php?cat=<base64>&scat=<base64>`, e.g. `cat=2` (Components),
  `scat=6` (GRAPHIC CARD). Base64 of the plain integer id.
- Cards: `.product_content` → `.product_title a` (href + title), `.product_brand`,
  `.redPrice`, and `[data-id]` for the numeric id.
- The listing repeats each product (grid + carousel), so rows must be deduped by id.
- No stock indicator on the listing; the product page has one.
- robots.txt contains only Cloudflare's content-signal boilerplate — explanatory
  comments with no `User-agent`/`Disallow` lines and no signals declared.

## chamacomputers.lk

Best-structured source. Product objects are embedded verbatim in the React Server
Component flight payload, so no HTML parsing is needed.

- Categories: `/products/<name>`, e.g. `/products/graphics%20cards`.
- Products appear as `"product":{...}` inside `self.__next_f.push([1,"..."])`
  chunks, escaped (`\"`). Unescape, then brace-match to extract the objects —
  they nest, so a regex terminator is not enough.
- Fields: `id`, `name`, `category`, `instock`, `price`, `undiscountedPrice`,
  `discount`, `preOrder`, `quantity`, `image`.
- Paginates at 12/page via `?page=N`.

## nanotek.lk and redlinetech.lk (shared platform)

Both run the same storefront (both built by callmetyno.com) with different themes,
so they share a fetch flow but **not** parsers — a redesign on one must not break
the other.

Flow per product:

1. `GET /category/{slug}` → product URLs (no prices in the HTML)
2. `GET /product/{slug}` → product id (`[data-product-id]`) + title
3. `GET /product/{id}/variants/0` → price + stock
4. `GET /product/{id}/variants/0/description` → manufacturer spec table

Gotchas found the hard way:

- **The CSRF `_token` query parameter is not required.** The browser sends it, but
  both endpoints answer without it. This matters for redlinetech (see below).
- **The two endpoints return different JSON shapes.** `/variants/0` returns a bare
  JSON string (`"<div>…"`); `/variants/0/description` returns an object
  (`{"description":"<div>…"}`). Feeding undecoded JSON to cheerio does not throw —
  it parses the escaped markup into junk nodes and silently yields nothing.
- **Title selectors differ.** nanotek puts a cart-total `<h1 class="ty-quoteValue">`
  ahead of the product name, so a bare `h1` picks up `"0 LKR"`. It needs
  `h1.ty-productTitle`. redlinetech has no such header and uses a bare `h1`.
- **Prices are per payment method** (cash / bank / card / BNPL). Cash is the lowest
  and is what both shops market as the real price, so it is taken as the headline
  price; the rest are kept in the payload.

### Spec tables are a real source of GPU data

Where a product page carries the manufacturer's spec table, it includes exactly
the fields the data model wants — no model recall required:

```
Recommended PSU  = 750W          → recommended_psu_watts
Power Connectors = 1 x 16-pin    → power_connector
Dimensions       = 249 x 126 x 50.6 mm → length_mm
```

Not every product has one (the ASUS RTX 5090 listings do not), so treat it as a
bonus, not a guarantee.

### redlinetech.lk is restricted by robots.txt

Its robots.txt disallows **all** query-string URLs:

```
Disallow: /*?*
Disallow: /*&*
Disallow: /*?page=
Disallow: */page/*
```

Consequences:

- Category pagination (`?page=N`) is off limits, so only the **first page (12
  products) per category** can be fetched. Coverage is capped accordingly.
- The price endpoint is still reachable because it works without the `_token`
  query parameter, so `/product/{id}/variants/0` is a clean, compliant path.

If fuller coverage from redlinetech matters, the way to get it is to ask them for
permission or a feed — not to ignore the file.

## pcbuilders.lk

The only one of the five with a real API. WordPress + WooCommerce, and the
**WooCommerce Store API is public**, so there is no HTML parsing at all:

    GET /wp-json/wc/store/v1/products?category=<termId>&per_page=100&page=N

robots.txt disallows only `/cart/`, `/checkout/`, `/my-account/` and
`*add-to-cart=*`. The Store API is the storefront's own read endpoint and is not
disallowed.

Each product carries `name`, `permalink`, `prices`, `is_in_stock`,
`is_on_backorder`, `stock_availability.text`, `images`, `categories`, and an
`attributes` table — every product had one, giving MANUFACTURER, MODEL and
RAM - SIZE as structured fields. `short_description` is consistently the
warranty ("3 YEARS WARRANTY"), which no other retailer publishes in a field of
its own.

### Category ids, and the used-parts tree

Seven term ids cover everything, and **filtering by a parent includes its
children** (verified: `processors`=41 against intel 19 + amd 20), so the
Intel/AMD, desktop-RAM, NVMe and hard-disk sub-categories need no separate call.

| Canonical | Term id | Shop's category |
|---|---|---|
| gpu | 95 | GRAPHIC CARDS |
| cpu | 58 | PROCESSORS |
| motherboard | 69 | MOTHERBOARDS |
| ram | 78 | MEMORY |
| storage | 81 | STORAGE |
| psu | 76 | POWER SUPPLY & UPS |
| case | 143 | COMPUTER CASE |

All seven sit under `components`. The shop keeps a **parallel `all-used-items`
tree** — used graphics cards, processors, boards, memory and supplies — which is
deliberately excluded. A used card at half price would win every comparison it
appeared in, against new stock, with nothing on the row to say why. The two
trees do not overlap, so scoping to `components` excludes used stock by
construction. A handful of **open-box** items are listed among new ones and are
filtered on the title for the same reason.

### Gotchas found the hard way

- **Prices are integer minor units as a string.** `"168050000"` with
  `currency_minor_unit: 2` is 1,680,500.00 LKR. Reading the field as a number
  would have made every price a hundred times too large.
- **`is_in_stock` is true for backordered items.** 206 of 319 products are
  "Available on backorder" while flagged in stock. Taking the flag at face value
  would have made this the shop that stocks everything, and let it win every
  cheapest-in-stock comparison with parts that have to be ordered in. Stock is
  `is_in_stock && !is_on_backorder`.
- **Names come back HTML-encoded, and JSON does not decode them.** The other
  scrapers get this free from cheerio. Here `&#8211;` survived into the title
  and then into the part id: two colours of "Corsair 3200D RS ARGB Mid-Tower
  Case &#8211; White" both minted `corsair-3200d-rs-8211-atx`.
- **Slugs go stale.** One product named "MSI Geforce RTX 5090 Ventus OC 3X 32GB"
  has the permalink `/msi-rtx-5070-ti-16gb-8/` — renamed, slug kept. Never
  derive identity from the slug; the title is the input.
- The API reports totals in `X-WP-Total` / `X-WP-TotalPages` headers, which the
  fetch helper does not surface, so pagination stops on a short page instead.

## winsoft.lk

The most restricted robots.txt of the six, and the only shop where **complete
coverage is not compliantly reachable**.

```
Disallow: /*?*
Disallow: /*&*
Disallow: /*?page=
Disallow: */page/*
Disallow: /search
```

Every query-string URL is off limits *and* so is path pagination, so a category
listing is capped at its first 12 products with no second route through it.

### Discovery is the union of two partial sources

Neither source is complete, and neither contains the other:

| Source | Gives | Problem |
|---|---|---|
| `/category/<slug>` | current products, 12 per category | pagination disallowed |
| `sitemap.xml` | a wider set, 291 product URLs | **stale** |

The sitemap is stale in a measurable way: every `lastmod` in it is the same
value (`2026-07-20T17:27:57`), it was evidently generated once and never
regenerated, and three of its URLs already 404. Of the 12 graphics cards on the
live category page, **only 5 appear in it** — the other 7 are newer than the
snapshot.

So the scraper takes the union: seven category pages plus the sitemap, then
reads each product page. That lifted graphics cards from 12 to 19 and the shop
as a whole from 87 to 111 products. Coverage is still partial by construction.
The way to more is to ask the shop for a feed, not to fetch `?page=2`.

### The product page is JSON-LD

Each `/product/<slug>` carries one `application/ld+json` `Product` block with
`name`, `sku`, `category`, `offers.price` and an `additionalProperty` spec table
(Brand, GPU Chipset, GPU VRAM, Motherboard Chipset, Socket Type). Nothing is
scraped out of markup.

Category comes from the JSON-LD `category`, which is sometimes a path
("Storage > SSD"); the first segment is mapped. **External Storage** is
deliberately left unmapped — it is where the shop files enclosures, portable
drives and, actually observed, a DVD rewriter.

### Gotchas found the hard way

- **`offers.availability` is hardcoded to `OutOfStock`.** Every product page
  says it, including ones the page itself renders as "In Stock" with a working
  Add to Cart. Believing it would have marked the entire shop out of stock,
  which drops it out of the configurator altogether. The `additionalProperty`
  row named `Availability` is the field that actually varies — but its casing
  does not ("In Stock", "in stock", "In stock"), so compare case-insensitively.
- **The Add to Cart button is not a stock signal.** It renders even on the one
  product whose spec table says Out of Stock.
- **Some parts are not sold on their own**, marked two different ways:
  "(SYSTEM ONLY)" and "(Not Sold Separately)". Both are bundled-with-a-build
  prices. Matching only the first let a "Crucial 32GB DDR5 5600MHz Desktop RAM
  (Not Sold Separately)" through at a price nobody could pay for it alone.
- **Most of the catalogue is not PC parts.** 200 of the ~330 pages read are
  laptops, mice, monitors and printers, discarded on their category.

## winsoft.lk

The most restricted robots.txt of the six, and the only shop where **complete
coverage is not compliantly reachable**.

```
Disallow: /*?*
Disallow: /*&*
Disallow: /*?page=
Disallow: */page/*
Disallow: /search
```

Every query-string URL is off limits *and* so is path pagination, so a category
listing is capped at its first 12 products with no second route through it.

### Discovery is the union of two partial sources

Neither source is complete, and neither contains the other:

| Source | Gives | Problem |
|---|---|---|
| `/category/<slug>` | current products, 12 per category | pagination disallowed |
| `sitemap.xml` | a wider set, 291 product URLs | **stale** |

The sitemap is stale in a measurable way: every `lastmod` in it is the same
value (`2026-07-20T17:27:57`), it was evidently generated once and never
regenerated, and three of its URLs already 404. Of the 12 graphics cards on the
live category page, **only 5 appear in it** — the other 7 are newer than the
snapshot.

So the scraper takes the union: seven category pages plus the sitemap, then
reads each product page. That lifted graphics cards from 12 to 19 and the shop
as a whole from 87 to 111 products. Coverage is still partial by construction.
The way to more is to ask the shop for a feed, not to fetch `?page=2`.

### The product page is JSON-LD

Each `/product/<slug>` carries one `application/ld+json` `Product` block with
`name`, `sku`, `category`, `offers.price` and an `additionalProperty` spec table
(Brand, GPU Chipset, GPU VRAM, Motherboard Chipset, Socket Type). Nothing is
scraped out of markup.

Category comes from the JSON-LD `category`, which is sometimes a path
("Storage > SSD"); the first segment is mapped. **External Storage** is
deliberately left unmapped — it is where the shop files enclosures, portable
drives and, actually observed, a DVD rewriter.

### Gotchas found the hard way

- **`offers.availability` is hardcoded to `OutOfStock`.** Every product page
  says it, including ones the page itself renders as "In Stock" with a working
  Add to Cart. Believing it would have marked the entire shop out of stock,
  which drops it out of the configurator altogether. The `additionalProperty`
  row named `Availability` is the field that actually varies — but its casing
  does not ("In Stock", "in stock", "In stock"), so compare case-insensitively.
- **The Add to Cart button is not a stock signal.** It renders even on the one
  product whose spec table says Out of Stock.
- **Some parts are not sold on their own**, marked two different ways:
  "(SYSTEM ONLY)" and "(Not Sold Separately)". Both are bundled-with-a-build
  prices. Matching only the first let a "Crucial 32GB DDR5 5600MHz Desktop RAM
  (Not Sold Separately)" through at a price nobody could pay for it alone.
- **Most of the catalogue is not PC parts.** 200 of the ~330 pages read are
  laptops, mice, monitors and printers, discarded on their category.
