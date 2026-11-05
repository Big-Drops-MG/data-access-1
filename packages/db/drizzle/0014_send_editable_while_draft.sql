CREATE OR REPLACE FUNCTION "public"."send_guard_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF NEW.email_type IS DISTINCT FROM OLD.email_type
    OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'send can only be edited while status is draft';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "send_only_while_scheduled" ON "send";--> statement-breakpoint
CREATE TRIGGER "send_only_while_draft" BEFORE UPDATE ON "send" FOR EACH ROW EXECUTE FUNCTION "public"."send_guard_update"();
