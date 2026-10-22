CREATE TYPE "public"."console_type" AS ENUM('console', 'handheld');--> statement-breakpoint
ALTER TYPE "public"."category" ADD VALUE 'laptops';--> statement-breakpoint
ALTER TYPE "public"."category" ADD VALUE 'consoles';--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "cpu_model" text;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "gpu_model" text;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "memory_gb" integer;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "storage_gb" integer;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "screen_inches" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "maker_code" text;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "console_type" "console_type";--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "platform" text;