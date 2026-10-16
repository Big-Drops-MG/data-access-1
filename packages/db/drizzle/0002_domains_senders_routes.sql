CREATE TYPE "public"."dns_record_purpose" AS ENUM('spf', 'dkim', 'dmarc', 'mx');--> statement-breakpoint
CREATE TYPE "public"."dns_record_status" AS ENUM('pending', 'pass', 'fail', 'pending_propagation');--> statement-breakpoint
CREATE TYPE "public"."domain_setup_step_status" AS ENUM('pending', 'in_progress', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."domain_setup_step_type" AS ENUM('ses_identity', 'dns_records', 'verification');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verifying', 'verified', 'failed', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."email_route_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('thank_you', 'feedback_request', 'engagement');--> statement-breakpoint
CREATE TYPE "public"."sender_status" AS ENUM('active', 'inactive', 'pending_verification');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
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
CREATE TABLE "email_route" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_type" "email_type" NOT NULL,
	"offer_id" uuid,
	"template_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"status" "email_route_status" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_route_version_positive" CHECK ("email_route"."version" > 0)
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
CREATE TABLE "template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email_type" "email_type" NOT NULL,
	"category_id" uuid NOT NULL,
	"current_version_id" uuid,
	"status" "template_status" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"subject" text NOT NULL,
	"body_source" text NOT NULL,
	"merge_tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_version_no_positive" CHECK ("template_version"."version_no" > 0)
);
--> statement-breakpoint
ALTER TABLE "dns_record" ADD CONSTRAINT "dns_record_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_setup_step" ADD CONSTRAINT "domain_setup_step_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_sender_id_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender" ADD CONSTRAINT "sender_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender" ADD CONSTRAINT "sender_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_current_version_same_template_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."template_version"("id","template_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dns_record_domain_purpose_name_unique" ON "dns_record" USING btree ("domain_id","purpose","name");--> statement-breakpoint
CREATE INDEX "dns_record_domain_id_status_idx" ON "dns_record" USING btree ("domain_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_name_unique" ON "domain" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "domain_status_idx" ON "domain" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_created_by_idx" ON "domain" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_setup_step_domain_id_step_unique" ON "domain_setup_step" USING btree ("domain_id","step");--> statement-breakpoint
CREATE INDEX "domain_setup_step_status_updated_at_idx" ON "domain_setup_step" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "domain_setup_step_domain_id_idx" ON "domain_setup_step" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_route_active_offer_unique" ON "email_route" USING btree ("email_type","offer_id") WHERE "email_route"."status" = 'active' AND "email_route"."offer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "email_route_active_default_unique" ON "email_route" USING btree ("email_type") WHERE "email_route"."status" = 'active' AND "email_route"."offer_id" IS NULL;--> statement-breakpoint
CREATE INDEX "email_route_email_type_status_idx" ON "email_route" USING btree ("email_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sender_from_email_unique" ON "sender" USING btree (lower("from_email"));--> statement-breakpoint
CREATE INDEX "sender_domain_id_status_idx" ON "sender" USING btree ("domain_id","status");--> statement-breakpoint
CREATE INDEX "sender_created_by_idx" ON "sender" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "template_name_unique" ON "template" USING btree ("name");--> statement-breakpoint
CREATE INDEX "template_email_type_status_idx" ON "template" USING btree ("email_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "template_version_template_version_no_unique" ON "template_version" USING btree ("template_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "template_version_id_template_unique" ON "template_version" USING btree ("id","template_id");--> statement-breakpoint
CREATE INDEX "template_version_template_created_at_idx" ON "template_version" USING btree ("template_id","created_at" desc);--> statement-breakpoint
CREATE TRIGGER "dns_record_set_updated_at" BEFORE UPDATE ON "dns_record" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "domain_set_updated_at" BEFORE UPDATE ON "domain" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "domain_setup_step_set_updated_at" BEFORE UPDATE ON "domain_setup_step" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "sender_set_updated_at" BEFORE UPDATE ON "sender" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "template_set_updated_at" BEFORE UPDATE ON "template" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "email_route_set_updated_at" BEFORE UPDATE ON "email_route" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE FUNCTION "public"."reject_template_version_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'template_version is immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "template_version_immutable" BEFORE UPDATE ON "template_version" FOR EACH ROW EXECUTE FUNCTION "public"."reject_template_version_update"();