ALTER TABLE "two_factor" ADD COLUMN "failure_window_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN "consecutive_lockout_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN "last_counted_lockout_until" timestamp with time zone;
