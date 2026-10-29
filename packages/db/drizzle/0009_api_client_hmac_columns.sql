ALTER TABLE "api_client" ADD COLUMN "secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "api_client" ADD COLUMN "old_secret_hash" text;--> statement-breakpoint
ALTER TABLE "api_client" ADD COLUMN "old_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "api_client" ADD COLUMN "rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_client" ADD COLUMN "ip_allowlist" text[] DEFAULT '{}'::text[] NOT NULL;
