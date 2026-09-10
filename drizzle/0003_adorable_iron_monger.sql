CREATE TYPE "public"."run_actor" AS ENUM('ci', 'desktop', 'cli');--> statement-breakpoint
CREATE TYPE "public"."run_kind" AS ENUM('scrape', 'normalize');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'ok', 'failed', 'abandoned');--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "run_kind" NOT NULL,
	"shop" text,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"actor" "run_actor" NOT NULL,
	"host" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"scraped" integer,
	"inserted" integer,
	"with_price" integer,
	"stats" jsonb,
	"error" text,
	"log_tail" text
);
--> statement-breakpoint
CREATE INDEX "pipeline_runs_recent_idx" ON "pipeline_runs" USING btree ("kind","shop","started_at");
--> statement-breakpoint
-- The lease. Written by hand because drizzle-kit does not emit partial indexes.
--
-- These are what stop the desktop app scraping a retailer that GitHub Actions is
-- already scraping: GitHub's `concurrency` groups only coordinate runs inside
-- GitHub. A second concurrent run of the same shop fails to INSERT, and that
-- unique violation is the answer "someone else has it" — not an error.
--
-- Dry runs are excluded: they touch no retailer state worth serialising, and a
-- smoke test must never block a real run.
CREATE UNIQUE INDEX "pipeline_runs_active_scrape_idx"
  ON "pipeline_runs" ("shop")
  WHERE "status" = 'running' AND "kind" = 'scrape' AND "dry_run" = false;
--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_runs_active_normalize_idx"
  ON "pipeline_runs" ("kind")
  WHERE "status" = 'running' AND "kind" = 'normalize' AND "dry_run" = false;
