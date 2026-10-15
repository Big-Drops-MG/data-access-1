CREATE TYPE "public"."dns_record_purpose" AS ENUM('spf', 'dkim', 'dmarc', 'mx');--> statement-breakpoint
CREATE TYPE "public"."dns_record_status" AS ENUM('pending', 'pass', 'fail', 'pending_propagation');--> statement-breakpoint
CREATE TYPE "public"."domain_setup_step_status" AS ENUM('pending', 'in_progress', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."domain_setup_step_type" AS ENUM('ses_identity', 'dns_records', 'verification');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verifying', 'verified', 'failed', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."email_category_kind" AS ENUM('transactional', 'relationship');--> statement-breakpoint
CREATE TYPE "public"."recipient_preference_source" AS ENUM('unsubscribe_link', 'preference_center', 'admin', 'system', 'import');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('active', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."recipient_tier" AS ENUM('standard', 'premium');--> statement-breakpoint
CREATE TYPE "public"."sender_status" AS ENUM('active', 'inactive', 'pending_verification');--> statement-breakpoint
CREATE TABLE "domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ses_identity_arn" text,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "email_category_kind" NOT NULL,
	"default_opted_in" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_hash" text NOT NULL,
	"external_user_id" text,
	"tier" "recipient_tier" DEFAULT 'standard' NOT NULL,
	"tier_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "recipient_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dns_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"purpose" "dns_record_purpose" NOT NULL,
	"name" text NOT NULL,
	"record_type" text NOT NULL,
	"expected_value" text NOT NULL,
	"last_seen_value" text,
	"status" "dns_record_status" DEFAULT 'pending' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_setup_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"step" "domain_setup_step_type" NOT NULL,
	"status" "domain_setup_step_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sender" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to" text,
	"status" "sender_status" DEFAULT 'pending_verification' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recipient_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"opted_out" boolean DEFAULT false NOT NULL,
	"source" "recipient_preference_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dns_record" ADD CONSTRAINT "dns_record_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_setup_step" ADD CONSTRAINT "domain_setup_step_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_category" ADD CONSTRAINT "email_category_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_preference" ADD CONSTRAINT "recipient_preference_recipient_id_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_preference" ADD CONSTRAINT "recipient_preference_category_id_email_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."email_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender" ADD CONSTRAINT "sender_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender" ADD CONSTRAINT "sender_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dns_record_domain_purpose_name_unique" ON "dns_record" USING btree ("domain_id","purpose","name");--> statement-breakpoint
CREATE INDEX "dns_record_domain_id_status_idx" ON "dns_record" USING btree ("domain_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_name_unique" ON "domain" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "domain_status_idx" ON "domain" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_created_by_idx" ON "domain" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_setup_step_domain_id_step_unique" ON "domain_setup_step" USING btree ("domain_id","step");--> statement-breakpoint
CREATE INDEX "domain_setup_step_status_updated_at_idx" ON "domain_setup_step" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "domain_setup_step_domain_id_idx" ON "domain_setup_step" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_category_key_unique" ON "email_category" USING btree ("key");--> statement-breakpoint
CREATE INDEX "email_category_created_by_idx" ON "email_category" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "email_category_is_active_idx" ON "email_category" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_email_unique" ON "recipient" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_email_hash_unique" ON "recipient" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "recipient_external_user_id_idx" ON "recipient" USING btree ("external_user_id");--> statement-breakpoint
CREATE INDEX "recipient_tier_status_idx" ON "recipient" USING btree ("tier","status");--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_preference_recipient_category_unique" ON "recipient_preference" USING btree ("recipient_id","category_id");--> statement-breakpoint
CREATE INDEX "recipient_preference_category_id_opted_out_idx" ON "recipient_preference" USING btree ("category_id","opted_out");--> statement-breakpoint
CREATE INDEX "recipient_preference_recipient_id_idx" ON "recipient_preference" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sender_from_email_unique" ON "sender" USING btree (lower("from_email"));--> statement-breakpoint
CREATE INDEX "sender_domain_id_status_idx" ON "sender" USING btree ("domain_id","status");--> statement-breakpoint
CREATE INDEX "sender_created_by_idx" ON "sender" USING btree ("created_by");--> statement-breakpoint
CREATE TRIGGER "dns_record_set_updated_at" BEFORE UPDATE ON "dns_record" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "domain_set_updated_at" BEFORE UPDATE ON "domain" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "domain_setup_step_set_updated_at" BEFORE UPDATE ON "domain_setup_step" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "email_category_set_updated_at" BEFORE UPDATE ON "email_category" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "recipient_set_updated_at" BEFORE UPDATE ON "recipient" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "recipient_preference_set_updated_at" BEFORE UPDATE ON "recipient_preference" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "sender_set_updated_at" BEFORE UPDATE ON "sender" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
