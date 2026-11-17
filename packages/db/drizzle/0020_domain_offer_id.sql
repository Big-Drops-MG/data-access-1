ALTER TABLE "domain" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_offer_id_idx" ON "domain" USING btree ("offer_id");
