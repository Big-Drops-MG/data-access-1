CREATE TYPE "public"."unsubscribe_custom_domain_status" AS ENUM('unset', 'pending', 'verified', 'failed');--> statement-breakpoint
CREATE TABLE "unsubscribe_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"logo_url" text,
	"custom_domain" text,
	"custom_domain_status" "unsubscribe_custom_domain_status" DEFAULT 'unset' NOT NULL,
	"verification_token" text,
	"verified_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unsubscribe_settings" ADD CONSTRAINT "unsubscribe_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unsubscribe_settings_custom_domain_status_idx" ON "unsubscribe_settings" USING btree ("custom_domain_status");
