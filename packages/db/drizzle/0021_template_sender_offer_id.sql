ALTER TABLE "template" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_offer_id_idx" ON "template" USING btree ("offer_id");--> statement-breakpoint
ALTER TABLE "sender" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "sender" ADD CONSTRAINT "sender_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sender_offer_id_idx" ON "sender" USING btree ("offer_id");
