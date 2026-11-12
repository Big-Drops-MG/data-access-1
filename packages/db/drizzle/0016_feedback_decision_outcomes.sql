ALTER TABLE "feedback_item" ALTER COLUMN "decision" TYPE text USING (
  CASE
    WHEN "decision"::text = 'dismiss' THEN 'no_action'
    ELSE "decision"::text
  END
);--> statement-breakpoint
DROP TYPE "public"."feedback_decision";--> statement-breakpoint
CREATE TYPE "public"."feedback_decision" AS ENUM('no_action', 'suppress', 'escalate');--> statement-breakpoint
ALTER TABLE "feedback_item" ALTER COLUMN "decision" TYPE "public"."feedback_decision" USING "decision"::"public"."feedback_decision";
