ALTER TABLE "integration_sync_state" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_sync_state" ADD CONSTRAINT "integration_sync_state_consecutive_failures_nonneg" CHECK ("consecutive_failures" >= 0);
