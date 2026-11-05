CREATE TYPE "public"."message_environment" AS ENUM('production', 'test');--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "environment" "message_environment" DEFAULT 'production' NOT NULL;
