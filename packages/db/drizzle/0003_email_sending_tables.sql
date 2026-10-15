CREATE TYPE "public"."email_route_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('thank_you', 'feedback_request', 'engagement');--> statement-breakpoint
CREATE TYPE "public"."frequency_rule_kind" AS ENUM('cap', 'collision');--> statement-breakpoint
CREATE TYPE "public"."message_skip_reason" AS ENUM('recipient_bounced', 'suppressed', 'opted_out', 'not_premium', 'collision', 'frequency_cap', 'no_route');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'complained', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('scheduled', 'queued', 'dispatching', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
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
CREATE TABLE "send" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_type" "email_type" NOT NULL,
	"template_version_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"offer_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "send_status" NOT NULL,
	"dispatch_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "send_version_positive" CHECK ("send"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_id" uuid,
	"recipient_id" uuid NOT NULL,
	"offer_id" uuid,
	"email_type" "email_type" NOT NULL,
	"template_version_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "message_status" NOT NULL,
	"skip_reason" "message_skip_reason",
	"failure_reason" text,
	"ses_message_id" text,
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_skip_reason_check" CHECK ((
        ("message"."status" = 'skipped' AND "message"."skip_reason" IS NOT NULL)
        OR ("message"."status" <> 'skipped' AND "message"."skip_reason" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "frequency_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "frequency_rule_kind" NOT NULL,
	"category_id" uuid,
	"max_count" integer,
	"window_days" integer,
	"blocks_with_type" "email_type",
	"min_gap_hours" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frequency_rule_version_positive" CHECK ("frequency_rule"."version" > 0),
	CONSTRAINT "frequency_rule_numbers_check" CHECK ((
        ("frequency_rule"."max_count" IS NULL OR "frequency_rule"."max_count" > 0)
        AND ("frequency_rule"."window_days" IS NULL OR "frequency_rule"."window_days" > 0)
        AND ("frequency_rule"."min_gap_hours" IS NULL OR "frequency_rule"."min_gap_hours" >= 0)
        AND (
          ("frequency_rule"."kind" = 'cap' AND "frequency_rule"."max_count" IS NOT NULL AND "frequency_rule"."window_days" IS NOT NULL)
          OR ("frequency_rule"."kind" = 'collision' AND "frequency_rule"."blocks_with_type" IS NOT NULL AND "frequency_rule"."min_gap_hours" IS NOT NULL)
        )
      ))
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
CREATE UNIQUE INDEX "template_version_id_template_unique" ON "template_version" USING btree ("id","template_id");--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_category_id_email_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."email_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_current_version_same_template_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."template_version"("id","template_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_sender_id_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_send_id_send_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."send"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_recipient_id_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequency_rule" ADD CONSTRAINT "frequency_rule_category_id_email_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."email_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequency_rule" ADD CONSTRAINT "frequency_rule_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_sender_id_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "template_name_unique" ON "template" USING btree ("name");--> statement-breakpoint
CREATE INDEX "template_email_type_status_idx" ON "template" USING btree ("email_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "template_version_template_version_no_unique" ON "template_version" USING btree ("template_id","version_no");--> statement-breakpoint
CREATE INDEX "template_version_template_created_at_idx" ON "template_version" USING btree ("template_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "send_status_scheduled_for_idx" ON "send" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "message_idempotency_key_unique" ON "message" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "message_ses_message_id_unique" ON "message" USING btree ("ses_message_id") WHERE "message"."ses_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "message_recipient_type_created_at_idx" ON "message" USING btree ("recipient_id","email_type","created_at" desc);--> statement-breakpoint
CREATE INDEX "message_send_status_idx" ON "message" USING btree ("send_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "frequency_rule_kind_category_unique" ON "frequency_rule" USING btree ("kind","category_id") WHERE "frequency_rule"."category_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "frequency_rule_kind_global_unique" ON "frequency_rule" USING btree ("kind") WHERE "frequency_rule"."category_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "email_route_active_offer_unique" ON "email_route" USING btree ("email_type","offer_id") WHERE "email_route"."status" = 'active' AND "email_route"."offer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "email_route_active_default_unique" ON "email_route" USING btree ("email_type") WHERE "email_route"."status" = 'active' AND "email_route"."offer_id" IS NULL;--> statement-breakpoint
CREATE INDEX "email_route_email_type_status_idx" ON "email_route" USING btree ("email_type","status");--> statement-breakpoint
CREATE TRIGGER "template_set_updated_at" BEFORE UPDATE ON "template" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "send_set_updated_at" BEFORE UPDATE ON "send" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "message_set_updated_at" BEFORE UPDATE ON "message" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "frequency_rule_set_updated_at" BEFORE UPDATE ON "frequency_rule" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "email_route_set_updated_at" BEFORE UPDATE ON "email_route" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE FUNCTION "public"."reject_template_version_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'template_version is immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "template_version_immutable" BEFORE UPDATE ON "template_version" FOR EACH ROW EXECUTE FUNCTION "public"."reject_template_version_update"();--> statement-breakpoint
CREATE FUNCTION "public"."send_guard_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'scheduled' THEN
    RETURN NEW;
  END IF;
  IF NEW.email_type IS DISTINCT FROM OLD.email_type
    OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'send can only be edited while status is scheduled';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "send_only_while_scheduled" BEFORE UPDATE ON "send" FOR EACH ROW EXECUTE FUNCTION "public"."send_guard_update"();
