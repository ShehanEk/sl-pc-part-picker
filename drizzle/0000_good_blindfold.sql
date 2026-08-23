CREATE TYPE "public"."category" AS ENUM('gpu', 'cpu', 'psu', 'motherboard', 'ram');--> statement-breakpoint
CREATE TYPE "public"."form_factor" AS ENUM('ATX', 'mATX', 'ITX');--> statement-breakpoint
CREATE TYPE "public"."power_connector" AS ENUM('8pin', '2x8pin', '12vhpwr', '12v-2x6');--> statement-breakpoint
CREATE TYPE "public"."ram_type" AS ENUM('DDR4', 'DDR5');--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_id" text NOT NULL,
	"shop" text NOT NULL,
	"price_lkr" numeric(12, 2) NOT NULL,
	"url" text NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"part_id" text PRIMARY KEY NOT NULL,
	"category" "category" NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"msrp_usd" numeric(10, 2),
	"tdp_watts" integer,
	"vram_gb" integer,
	"power_connector" "power_connector",
	"length_mm" integer,
	"recommended_psu_watts" integer,
	"socket" text,
	"ram_type" "ram_type",
	"integrated_graphics" boolean,
	"ram_slots" integer,
	"max_ram_gb" integer,
	"max_supported_speed_mhz" integer,
	"form_factor" "form_factor",
	"speed_mhz" integer,
	"capacity_gb" integer,
	"modules" integer,
	"rated_watts" integer,
	"connectors" "power_connector"[],
	"efficiency_rating" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"part_id" text NOT NULL,
	"shop" text NOT NULL,
	"recorded_on" date NOT NULL,
	"price_lkr" numeric(12, 2) NOT NULL,
	CONSTRAINT "price_history_part_id_shop_recorded_on_pk" PRIMARY KEY("part_id","shop","recorded_on")
);
--> statement-breakpoint
CREATE TABLE "raw_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop" text NOT NULL,
	"source_url" text NOT NULL,
	"raw_title" text NOT NULL,
	"raw_price_text" text,
	"raw_payload" jsonb,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"normalized_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_part_id_parts_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("part_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_part_id_parts_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("part_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listings_part_shop_idx" ON "listings" USING btree ("part_id","shop");--> statement-breakpoint
CREATE INDEX "listings_part_price_idx" ON "listings" USING btree ("part_id","price_lkr");--> statement-breakpoint
CREATE INDEX "parts_category_idx" ON "parts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "price_history_part_date_idx" ON "price_history" USING btree ("part_id","recorded_on");--> statement-breakpoint
CREATE INDEX "raw_listings_pending_idx" ON "raw_listings" USING btree ("normalized_at","scraped_at");