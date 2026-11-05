ALTER TYPE "public"."send_status" ADD VALUE 'draft' BEFORE 'scheduled';--> statement-breakpoint
ALTER TABLE "send" ADD COLUMN "category_id" uuid;--> statement-breakpoint
UPDATE "send" AS s
SET "category_id" = t."category_id"
FROM "template_version" AS tv
INNER JOIN "template" AS t ON t."id" = tv."template_id"
WHERE s."template_version_id" = tv."id"
  AND s."category_id" IS NULL;--> statement-breakpoint
ALTER TABLE "send" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "send" ADD CONSTRAINT "send_category_id_email_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."email_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "send_category_id_idx" ON "send" USING btree ("category_id");
