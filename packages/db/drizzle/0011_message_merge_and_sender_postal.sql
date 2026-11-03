ALTER TABLE "sender" ADD COLUMN "postal_address" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "merge_data" jsonb DEFAULT '{}'::jsonb NOT NULL;
