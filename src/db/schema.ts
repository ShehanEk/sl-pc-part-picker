import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const categoryEnum = pgEnum('category', [
  'gpu',
  'cpu',
  'psu',
  'motherboard',
  'ram',
  'storage',
  'case',
])

/**
 * How a drive attaches. The distinction matters because an M.2 stick and a
 * 2.5-inch SATA drive need different things from the board.
 */
export const storageInterfaceEnum = pgEnum('storage_interface', [
  'm2-nvme',
  'm2-sata',
  'sata',
])

export const powerConnectorEnum = pgEnum('power_connector', [
  '8pin',
  '2x8pin',
  '12vhpwr',
  '12v-2x6',
])

export const ramTypeEnum = pgEnum('ram_type', ['DDR4', 'DDR5'])

export const formFactorEnum = pgEnum('form_factor', ['ATX', 'mATX', 'ITX'])

/**
 * Canonical part specs — the target every scraper normalizes onto.
 * Category-specific columns are nullable; which ones apply is determined by `category`.
 */
export const parts = pgTable(
  'parts',
  {
    partId: text('part_id').primaryKey(),
    category: categoryEnum('category').notNull(),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    msrpUsd: numeric('msrp_usd', { precision: 10, scale: 2 }),

    // gpu + cpu
    tdpWatts: integer('tdp_watts'),

    // gpu
    vramGb: integer('vram_gb'),
    powerConnector: powerConnectorEnum('power_connector'),
    lengthMm: integer('length_mm'),
    recommendedPsuWatts: integer('recommended_psu_watts'),

    // cpu + motherboard
    socket: text('socket'),

    // cpu + motherboard + ram
    ramType: ramTypeEnum('ram_type'),

    // cpu
    integratedGraphics: boolean('integrated_graphics'),

    // motherboard
    ramSlots: integer('ram_slots'),
    maxRamGb: integer('max_ram_gb'),
    maxSupportedSpeedMhz: integer('max_supported_speed_mhz'),
    formFactor: formFactorEnum('form_factor'),

    // ram
    speedMhz: integer('speed_mhz'),
    capacityGb: integer('capacity_gb'),
    modules: integer('modules'),

    // storage
    storageInterface: storageInterfaceEnum('storage_interface'),

    // case — `formFactor` above is reused, meaning the LARGEST board it takes.
    // A case that fits ATX also fits mATX and ITX, so one value plus an
    // ordering covers the check without a list of supported sizes.

    // psu
    ratedWatts: integer('rated_watts'),
    connectors: powerConnectorEnum('connectors').array(),
    efficiencyRating: text('efficiency_rating'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('parts_category_idx').on(t.category)],
)

/**
 * Raw scrape output, written before any normalization so ingest can be
 * reprocessed without re-scraping. Never mutated except to stamp `normalizedAt`.
 */
export const rawListings = pgTable(
  'raw_listings',
  {
    id: serial('id').primaryKey(),
    shop: text('shop').notNull(),
    sourceUrl: text('source_url').notNull(),
    rawTitle: text('raw_title').notNull(),
    rawPriceText: text('raw_price_text'),
    rawPayload: jsonb('raw_payload'),
    scrapedAt: timestamp('scraped_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    normalizedAt: timestamp('normalized_at', { withTimezone: true }),
  },
  (t) => [index('raw_listings_pending_idx').on(t.normalizedAt, t.scrapedAt)],
)

/** Clean normalized listings — one row per (part, shop), overwritten each run. */
export const listings = pgTable(
  'listings',
  {
    id: serial('id').primaryKey(),
    partId: text('part_id')
      .notNull()
      .references(() => parts.partId, { onDelete: 'cascade' }),
    shop: text('shop').notNull(),
    priceLkr: numeric('price_lkr', { precision: 12, scale: 2 }).notNull(),
    url: text('url').notNull(),
    inStock: boolean('in_stock').notNull().default(true),
    scrapedAt: timestamp('scraped_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('listings_part_shop_idx').on(t.partId, t.shop),
    index('listings_part_price_idx').on(t.partId, t.priceLkr),
  ],
)

/** Append-only daily price points. One row per (part, shop, day). */
export const priceHistory = pgTable(
  'price_history',
  {
    partId: text('part_id')
      .notNull()
      .references(() => parts.partId, { onDelete: 'cascade' }),
    shop: text('shop').notNull(),
    recordedOn: date('recorded_on').notNull(),
    priceLkr: numeric('price_lkr', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.partId, t.shop, t.recordedOn] }),
    index('price_history_part_date_idx').on(t.partId, t.recordedOn),
  ],
)

export type Part = typeof parts.$inferSelect
export type NewPart = typeof parts.$inferInsert
export type RawListing = typeof rawListings.$inferSelect
export type NewRawListing = typeof rawListings.$inferInsert
export type Listing = typeof listings.$inferSelect
export type NewListing = typeof listings.$inferInsert
export type PriceHistoryRow = typeof priceHistory.$inferSelect
