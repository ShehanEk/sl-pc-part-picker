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
    /**
     * Whether the shop had it in stock that day. Without it, 22% of the
     * history was prices nobody could pay, and the chart's "lowest price" was
     * often one of them. Null only on rows from before the column existed that
     * could not be matched back to a scrape; read as in stock, the same rule the
     * listings use for a shop that publishes no stock status.
     */
    inStock: boolean('in_stock'),
  },
  (t) => [
    primaryKey({ columns: [t.partId, t.shop, t.recordedOn] }),
    index('price_history_part_date_idx').on(t.partId, t.recordedOn),
  ],
)

/**
 * Hand-entered spec values, applied on top of everything the pipeline produces.
 *
 * This is the top of the provenance ladder: manual > curated > scraped > null.
 * `applyOverrides()` runs immediately after `applyCuratedSpecs()` at the end of
 * every normalize run, so a value entered here survives a pipeline that would
 * otherwise overwrite it — `parts.tdp_watts`, `vram_gb` and `connectors` are
 * rewritten unconditionally by the curated catalog, and the GPU spec patch
 * rewrites four more columns on every run.
 *
 * Every column is nullable and applied with COALESCE, so a row overrides only
 * the fields it actually sets. A null here means "no opinion", not "force null".
 *
 * **Deliberately no foreign key to `parts`.** `foldAliases()` hard-deletes alias
 * part rows, and an FK with the cascade the rest of the schema uses would take
 * the human's work with it. An orphaned override is harmless — it simply never
 * matches — and it comes back if that part id ever reappears.
 */
export const partOverrides = pgTable('part_overrides', {
  partId: text('part_id').primaryKey(),

  // gpu + cpu
  tdpWatts: integer('tdp_watts'),

  // gpu
  vramGb: integer('vram_gb'),
  powerConnector: powerConnectorEnum('power_connector'),
  recommendedPsuWatts: integer('recommended_psu_watts'),

  // cpu + motherboard
  socket: text('socket'),

  // cpu + motherboard + ram
  ramType: ramTypeEnum('ram_type'),

  // motherboard
  ramSlots: integer('ram_slots'),
  maxRamGb: integer('max_ram_gb'),
  maxSupportedSpeedMhz: integer('max_supported_speed_mhz'),

  // motherboard + case
  formFactor: formFactorEnum('form_factor'),

  // ram
  speedMhz: integer('speed_mhz'),
  modules: integer('modules'),

  // ram + storage
  capacityGb: integer('capacity_gb'),

  // storage
  storageInterface: storageInterfaceEnum('storage_interface'),

  // psu
  ratedWatts: integer('rated_watts'),
  connectors: powerConnectorEnum('connectors').array(),
  efficiencyRating: text('efficiency_rating'),

  /** Where the value came from. Required — the project does not accept uncited specs. */
  note: text('note').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const runKindEnum = pgEnum('run_kind', ['scrape', 'normalize'])
export const runStatusEnum = pgEnum('run_status', ['running', 'ok', 'failed', 'abandoned'])
/** Who started the run. `ci` is GitHub Actions, `desktop` the tray app, `cli` a terminal. */
export const runActorEnum = pgEnum('run_actor', ['ci', 'desktop', 'cli'])

/**
 * What actually happened on each pipeline run.
 *
 * Two jobs, and the second is the surprising one.
 *
 * 1. **A record.** `RunResult` and `NormalizeResult` were printed and thrown
 *    away, which is why the admin dashboard has to admit it "cannot tell a
 *    failed run from a run that found nothing new" — the scrapers throw before
 *    writing, so silence looked identical either way.
 *
 * 2. **A lease.** The row is written with `status = 'running'` *before* the work
 *    starts, and a partial unique index on `(shop) where status='running' and
 *    kind='scrape'` makes a second concurrent scrape of the same shop fail to
 *    insert. That unique violation is the answer "someone else has it", not an
 *    error. GitHub's `concurrency` groups only coordinate runs inside GitHub;
 *    this is what stops the desktop app scraping a retailer that CI is already
 *    scraping. A table of only *completed* runs could not do that.
 *
 * Rows outlive the parts they describe, so there is no foreign key: the point of
 * the table is diagnosing runs, including ones that produced nothing.
 */
export const pipelineRuns = pgTable(
  'pipeline_runs',
  {
    id: serial('id').primaryKey(),
    kind: runKindEnum('kind').notNull(),
    /** Null for normalize, which is not per-shop. */
    shop: text('shop'),
    status: runStatusEnum('status').notNull().default('running'),
    actor: runActorEnum('actor').notNull(),
    /** Machine name, so two operators' runs are tellable apart. */
    host: text('host'),
    /** A dry run holds no lease and is recorded only if it is recorded at all. */
    dryRun: boolean('dry_run').notNull().default(false),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),

    // RunResult, flattened — these three are asked about constantly.
    scraped: integer('scraped'),
    inserted: integer('inserted'),
    withPrice: integer('with_price'),

    /** NormalizeResult verbatim. Its shape will move; this table is for triage. */
    stats: jsonb('stats'),

    /** First line of the throw. This is the field the dashboard was missing. */
    error: text('error'),
    /** Last few KB of the run log, for when the error alone is not enough. */
    logTail: text('log_tail'),
  },
  (t) => [index('pipeline_runs_recent_idx').on(t.kind, t.shop, t.startedAt)],
)

export type Part = typeof parts.$inferSelect
export type NewPart = typeof parts.$inferInsert
export type RawListing = typeof rawListings.$inferSelect
export type NewRawListing = typeof rawListings.$inferInsert
export type Listing = typeof listings.$inferSelect
export type NewListing = typeof listings.$inferInsert
export type PriceHistoryRow = typeof priceHistory.$inferSelect

export type PartOverride = typeof partOverrides.$inferSelect
export type NewPartOverride = typeof partOverrides.$inferInsert

export type PipelineRun = typeof pipelineRuns.$inferSelect
export type NewPipelineRun = typeof pipelineRuns.$inferInsert
