DO $$
BEGIN
  IF (SELECT count(*) FROM "offer") <> 0 THEN
    RAISE EXCEPTION 'offer must be empty before adding required columns';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('active', 'inactive');--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "external_ref" text NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "status" "offer_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_external_ref_unique" ON "offer" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "offer_status_idx" ON "offer" USING btree ("status");--> statement-breakpoint
CREATE TRIGGER "offer_set_updated_at" BEFORE UPDATE ON "offer" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
