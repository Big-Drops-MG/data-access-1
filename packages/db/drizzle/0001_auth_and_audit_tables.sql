CREATE TYPE "public"."api_client_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'api_client', 'system');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "api_client_status" NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_id_check" CHECK ((
        ("audit_log"."actor_type" = 'system' AND "audit_log"."actor_id" IS NULL)
        OR ("audit_log"."actor_type" IN ('user', 'api_client') AND "audit_log"."actor_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_client" ADD CONSTRAINT "api_client_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_device" ADD CONSTRAINT "trusted_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_client_key_prefix_unique" ON "api_client" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_client_status_idx" ON "api_client" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_type","actor_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_request_id_idx" ON "audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_device_token_hash_unique" ON "trusted_device" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "trusted_device_user_id_idx" ON "trusted_device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trusted_device_expires_at_idx" ON "trusted_device" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "two_factor_user_id_unique" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE TRIGGER "account_set_updated_at" BEFORE UPDATE ON "account" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "api_client_set_updated_at" BEFORE UPDATE ON "api_client" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "session_set_updated_at" BEFORE UPDATE ON "session" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "two_factor_set_updated_at" BEFORE UPDATE ON "two_factor" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "verification_set_updated_at" BEFORE UPDATE ON "verification" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE FUNCTION "public"."strip_audit_secrets"(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  sensitive text[] := ARRAY[
    'password', 'secret', 'token', 'accesstoken', 'refreshtoken', 'idtoken',
    'backupcodes', 'secrethash', 'authorization', 'cookie', 'setcookie',
    'emailbody', 'html', 'bodyhtml', 'bodytext', 'rawemail', 'textbody'
  ];
  entry record;
  result jsonb;
BEGIN
  IF payload IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(payload) = 'array' THEN
    SELECT coalesce(jsonb_agg(public.strip_audit_secrets(elem)), '[]'::jsonb)
    INTO result
    FROM jsonb_array_elements(payload) AS elem;
    RETURN result;
  END IF;
  IF jsonb_typeof(payload) <> 'object' THEN
    RETURN payload;
  END IF;
  result := '{}'::jsonb;
  FOR entry IN SELECT * FROM jsonb_each(payload) LOOP
    IF replace(lower(entry.key), '_', '') = ANY (sensitive) THEN
      CONTINUE;
    END IF;
    result := result || jsonb_build_object(entry.key, public.strip_audit_secrets(entry.value));
  END LOOP;
  RETURN result;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "public"."audit_log_before_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.before := public.strip_audit_secrets(NEW.before);
  NEW.after := public.strip_audit_secrets(NEW.after);
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_strip_secrets" BEFORE INSERT ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_before_insert"();--> statement-breakpoint
CREATE FUNCTION "public"."audit_log_reject_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_reject_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_log_no_delete" BEFORE DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_reject_mutation"();