CREATE TYPE "public"."peripheral_type" AS ENUM('keyboard', 'mouse', 'gamepad');--> statement-breakpoint
ALTER TYPE "public"."category" ADD VALUE 'peripherals';--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "peripheral_type" "peripheral_type";--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "wireless" boolean;