CREATE TYPE "public"."storage_interface" AS ENUM('m2-nvme', 'm2-sata', 'sata');--> statement-breakpoint
ALTER TYPE "public"."category" ADD VALUE 'storage';--> statement-breakpoint
ALTER TYPE "public"."category" ADD VALUE 'case';--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "storage_interface" "storage_interface";