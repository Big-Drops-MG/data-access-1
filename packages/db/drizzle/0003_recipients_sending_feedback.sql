CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."blocklist_target_type" AS ENUM('domain', 'ip');--> statement-breakpoint
CREATE TYPE "public"."email_category_kind" AS ENUM('transactional', 'relationship');--> statement-breakpoint
CREATE TYPE "public"."feedback_decision" AS ENUM('suppress', 'dismiss');--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('provider_fbl', 'feedback_form', 'mailbox_report');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('pending', 'in_review', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."filter_entry_category" AS ENUM('provider_rule', 'algorithm_update', 'blocklist_policy', 'authentication', 'general');--> statement-breakpoint
CREATE TYPE "public"."frequency_rule_kind" AS ENUM('cap', 'collision');--> statement-breakpoint
CREATE TYPE "public"."integration_sync_status" AS ENUM('healthy', 'degraded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_skip_reason" AS ENUM('recipient_bounced', 'suppressed', 'opted_out', 'not_premium', 'collision', 'frequency_cap', 'no_route');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'complained', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."provider_report_provider" AS ENUM('postmaster', 'snds', 'jmrp', 'yahoo');--> statement-breakpoint
CREATE TYPE "public"."provider_report_status" AS ENUM('new', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recipient_preference_source" AS ENUM('unsubscribe_link', 'preference_center', 'admin', 'system', 'import');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('active', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."recipient_tier" AS ENUM('standard', 'premium');--> statement-breakpoint
CREATE TYPE "public"."seed_account_status" AS ENUM('active', 'inactive', 'failed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."seed_placement" AS ENUM('inbox', 'promotions', 'spam', 'missing');--> statement-breakpoint
CREATE TYPE "public"."seed_placement_source" AS ENUM('imap_direct', 'seed_list_only', 'webhook', 'manual');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('scheduled', 'queued', 'dispatching', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('global', 'offer', 'list_unsub');--> statement-breakpoint
CREATE TYPE "public"."suppression_source" AS ENUM('optizmo', 'list_unsub', 'feedback_review', 'manual', 'hard_bounce');--> statement-breakpoint
CREATE TYPE "public"."suppression_sync_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suppression_sync_trigger" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"payload" jsonb,
	"dedupe_key" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"last_triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_resolved_at_check" CHECK (("alert"."status" = 'resolved' AND "alert"."resolved_at" IS NOT NULL) OR ("alert"."status" <> 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "blocklist_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "blocklist_target_type" NOT NULL,
	"target" text NOT NULL,
	"list_name" text NOT NULL,
	"listed" boolean,
	"checked_at" timestamp with time zone NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "feedback_classification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid,
	"message_id" uuid,
	"source" "feedback_source" NOT NULL,
	"provider" text,
	"classification_id" uuid,
	"status" "feedback_status" DEFAULT 'pending' NOT NULL,
	"reviewing_by" uuid,
	"locked_at" timestamp with time zone,
	"decision" "feedback_decision",
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"dedupe_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_item_decision_check" CHECK ((
        ("feedback_item"."decision" IS NULL AND "feedback_item"."decided_by" IS NULL AND "feedback_item"."decided_at" IS NULL)
        OR ("feedback_item"."decision" IS NOT NULL AND "feedback_item"."decided_by" IS NOT NULL AND "feedback_item"."decided_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "filter_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"source_url" text,
	"category" "filter_entry_category" NOT NULL,
	"linked_change" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filter_entry_source_url_check" CHECK ("filter_entry"."source_url" IS NULL OR "filter_entry"."source_url" ~* '^https?://')
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
CREATE TABLE "integration_sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"status" "integration_sync_status" DEFAULT 'healthy' NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"external_ref" text NOT NULL,
	"status" "offer_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "provider_report_provider" NOT NULL,
	"mailbox_uid" text,
	"content_hash" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"parsed" jsonb,
	"raw_content" text,
	"raw_content_ref" text,
	"status" "provider_report_status" DEFAULT 'new' NOT NULL,
	"parse_error" text,
	"parsed_at" timestamp with time zone,
	"feedback_item_id" uuid,
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
CREATE TABLE "seed_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"address" text NOT NULL,
	"credential_ref" text NOT NULL,
	"status" "seed_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seed_placement_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"seed_account_id" uuid NOT NULL,
	"placement" "seed_placement" NOT NULL,
	"source" "seed_placement_source" NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "suppression_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"recipient_id" uuid,
	"scope" "suppression_scope" NOT NULL,
	"offer_id" uuid,
	"source" "suppression_source" NOT NULL,
	"reason" text,
	"added_by" uuid,
	"sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "suppression_entry_scope_offer_check" CHECK ((
        ("suppression_entry"."scope" = 'offer' AND "suppression_entry"."offer_id" IS NOT NULL)
        OR ("suppression_entry"."scope" <> 'offer' AND "suppression_entry"."offer_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "suppression_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"trigger" "suppression_sync_trigger" NOT NULL,
	"status" "suppression_sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_added" integer DEFAULT 0 NOT NULL,
	"rows_removed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_category" ADD CONSTRAINT "email_category_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_classification" ADD CONSTRAINT "feedback_classification_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_item_recipient_id_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_item_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_item_classification_id_feedback_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."feedback_classification"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_item_reviewing_by_user_id_fk" FOREIGN KEY ("reviewing_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_item_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_entry" ADD CONSTRAINT "filter_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequency_rule" ADD CONSTRAINT "frequency_rule_category_id_email_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."email_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequency_rule" ADD CONSTRAINT "frequency_rule_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_send_id_send_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."send"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_recipient_id_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_report" ADD CONSTRAINT "provider_report_feedback_item_id_feedback_item_id_fk" FOREIGN KEY ("feedback_item_id") REFERENCES "public"."feedback_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_preference" ADD CONSTRAINT "recipient_preference_recipient_id_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_preference" ADD CONSTRAINT "recipient_preference_category_id_email_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."email_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_placement_result" ADD CONSTRAINT "seed_placement_result_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_placement_result" ADD CONSTRAINT "seed_placement_result_seed_account_id_seed_account_id_fk" FOREIGN KEY ("seed_account_id") REFERENCES "public"."seed_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_sender_id_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entry" ADD CONSTRAINT "suppression_entry_recipient_id_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entry" ADD CONSTRAINT "suppression_entry_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entry" ADD CONSTRAINT "suppression_entry_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entry" ADD CONSTRAINT "suppression_entry_sync_run_id_suppression_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."suppression_sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_sync_run" ADD CONSTRAINT "suppression_sync_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_status_severity_idx" ON "alert" USING btree ("status","severity");--> statement-breakpoint
CREATE INDEX "alert_type_status_idx" ON "alert" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_dedupe_open_unique" ON "alert" USING btree ("dedupe_key") WHERE "alert"."dedupe_key" IS NOT NULL AND "alert"."status" = 'open';--> statement-breakpoint
CREATE INDEX "blocklist_check_target_checked_at_idx" ON "blocklist_check" USING btree ("target","checked_at" desc);--> statement-breakpoint
CREATE INDEX "blocklist_check_list_name_checked_at_idx" ON "blocklist_check" USING btree ("list_name","checked_at" desc);--> statement-breakpoint
CREATE INDEX "blocklist_check_lookup_history_idx" ON "blocklist_check" USING btree ("target_type","target","list_name","checked_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "email_category_key_unique" ON "email_category" USING btree ("key");--> statement-breakpoint
CREATE INDEX "email_category_created_by_idx" ON "email_category" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "email_category_is_active_idx" ON "email_category" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_classification_key_unique" ON "feedback_classification" USING btree ("key");--> statement-breakpoint
CREATE INDEX "feedback_classification_active_idx" ON "feedback_classification" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_item_dedupe_hash_unique" ON "feedback_item" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX "feedback_item_status_created_at_idx" ON "feedback_item" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_item_reviewing_locked_idx" ON "feedback_item" USING btree ("reviewing_by","locked_at");--> statement-breakpoint
CREATE INDEX "filter_entry_created_at_idx" ON "filter_entry" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "filter_entry_category_created_at_idx" ON "filter_entry" USING btree ("category","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "frequency_rule_kind_category_unique" ON "frequency_rule" USING btree ("kind","category_id") WHERE "frequency_rule"."category_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "frequency_rule_kind_global_unique" ON "frequency_rule" USING btree ("kind") WHERE "frequency_rule"."category_id" IS NULL;--> statement-breakpoint
CREATE INDEX "integration_sync_state_status_last_attempt_idx" ON "integration_sync_state" USING btree ("status","last_attempt_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "message_idempotency_key_unique" ON "message" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "message_ses_message_id_unique" ON "message" USING btree ("ses_message_id") WHERE "message"."ses_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "message_recipient_type_created_at_idx" ON "message" USING btree ("recipient_id","email_type","created_at" desc);--> statement-breakpoint
CREATE INDEX "message_send_status_idx" ON "message" USING btree ("send_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_external_ref_unique" ON "offer" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "offer_status_idx" ON "offer" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_report_content_hash_unique" ON "provider_report" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_report_provider_mailbox_uid_unique" ON "provider_report" USING btree ("provider","mailbox_uid") WHERE "provider_report"."mailbox_uid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "provider_report_status_received_at_idx" ON "provider_report" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "provider_report_feedback_item_id_idx" ON "provider_report" USING btree ("feedback_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_email_unique" ON "recipient" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_email_hash_unique" ON "recipient" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "recipient_external_user_id_idx" ON "recipient" USING btree ("external_user_id");--> statement-breakpoint
CREATE INDEX "recipient_tier_status_idx" ON "recipient" USING btree ("tier","status");--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_preference_recipient_category_unique" ON "recipient_preference" USING btree ("recipient_id","category_id");--> statement-breakpoint
CREATE INDEX "recipient_preference_category_id_opted_out_idx" ON "recipient_preference" USING btree ("category_id","opted_out");--> statement-breakpoint
CREATE INDEX "recipient_preference_recipient_id_idx" ON "recipient_preference" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seed_account_address_unique" ON "seed_account" USING btree (lower("address"));--> statement-breakpoint
CREATE INDEX "seed_account_provider_status_idx" ON "seed_account" USING btree ("provider","status");--> statement-breakpoint
CREATE INDEX "seed_placement_result_seed_account_checked_at_idx" ON "seed_placement_result" USING btree ("seed_account_id","checked_at" desc);--> statement-breakpoint
CREATE INDEX "seed_placement_result_message_checked_at_idx" ON "seed_placement_result" USING btree ("message_id","checked_at" desc);--> statement-breakpoint
CREATE INDEX "send_status_scheduled_for_idx" ON "send" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_entry_offer_active_unique" ON "suppression_entry" USING btree ("email_hash","scope","offer_id") WHERE "suppression_entry"."removed_at" IS NULL AND "suppression_entry"."offer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_entry_global_active_unique" ON "suppression_entry" USING btree ("email_hash","scope") WHERE "suppression_entry"."removed_at" IS NULL AND "suppression_entry"."offer_id" IS NULL;--> statement-breakpoint
CREATE INDEX "suppression_entry_email_hash_removed_at_idx" ON "suppression_entry" USING btree ("email_hash","removed_at");--> statement-breakpoint
CREATE INDEX "suppression_entry_offer_scope_removed_at_idx" ON "suppression_entry" USING btree ("offer_id","scope","removed_at");--> statement-breakpoint
CREATE INDEX "suppression_sync_run_source_started_at_idx" ON "suppression_sync_run" USING btree ("source","started_at" desc);--> statement-breakpoint
ALTER TABLE "email_route" ADD CONSTRAINT "email_route_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_category_id_email_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."email_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "email_category_set_updated_at" BEFORE UPDATE ON "email_category" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "recipient_set_updated_at" BEFORE UPDATE ON "recipient" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "recipient_preference_set_updated_at" BEFORE UPDATE ON "recipient_preference" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "offer_set_updated_at" BEFORE UPDATE ON "offer" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "send_set_updated_at" BEFORE UPDATE ON "send" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "message_set_updated_at" BEFORE UPDATE ON "message" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "frequency_rule_set_updated_at" BEFORE UPDATE ON "frequency_rule" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "alert_set_updated_at" BEFORE UPDATE ON "alert" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "feedback_classification_set_updated_at" BEFORE UPDATE ON "feedback_classification" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "feedback_item_set_updated_at" BEFORE UPDATE ON "feedback_item" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "filter_entry_set_updated_at" BEFORE UPDATE ON "filter_entry" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "integration_sync_state_set_updated_at" BEFORE UPDATE ON "integration_sync_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "provider_report_set_updated_at" BEFORE UPDATE ON "provider_report" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "seed_account_set_updated_at" BEFORE UPDATE ON "seed_account" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
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