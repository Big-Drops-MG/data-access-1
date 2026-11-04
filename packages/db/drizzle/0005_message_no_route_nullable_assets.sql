ALTER TABLE "message" ALTER COLUMN "template_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_no_route_assets_check" CHECK ((
  (
    "status" = 'skipped'
    AND "skip_reason" = 'no_route'
    AND "template_version_id" IS NULL
    AND "sender_id" IS NULL
  )
  OR (
    NOT (
      "status" = 'skipped'
      AND "skip_reason" = 'no_route'
    )
    AND "template_version_id" IS NOT NULL
    AND "sender_id" IS NOT NULL
  )
));