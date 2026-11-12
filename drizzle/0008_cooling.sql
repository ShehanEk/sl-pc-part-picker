CREATE TYPE "public"."cooling_type" AS ENUM('air', 'aio', 'fan', 'paste', 'lighting');--> statement-breakpoint
ALTER TYPE "public"."category" ADD VALUE 'cooling';--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "cooling_type" "cooling_type";--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "cooler_sockets" text[];--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "radiator_mm" integer;