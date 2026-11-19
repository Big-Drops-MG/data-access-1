CREATE OR REPLACE FUNCTION "public"."audit_log_reject_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('emailhub.purge_audit', true) = '1' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."purge_audit_log_before"(cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  PERFORM set_config('emailhub.purge_audit', '1', true);
  DELETE FROM public.audit_log WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."purge_audit_log_before"(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."purge_audit_log_before"(timestamptz) TO PUBLIC;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_status_queued_at_idx" ON "message" ("status", "queued_at");
