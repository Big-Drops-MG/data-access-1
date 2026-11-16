ALTER TABLE "offer" ADD COLUMN "everflow_offer_id" integer;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "approved_subject_lines" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "approved_from_lines" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "tracking_links" jsonb DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "creatives" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "unsubscribe_url" text;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "suppression_file_url" text;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "optizmo_mailer_access_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "has_optizmo_mailer_access_key" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_everflow_offer_id_unique" ON "offer" USING btree ("everflow_offer_id");
