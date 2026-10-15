CREATE TYPE "public"."user_role" AS ENUM('admin', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree (lower("email"));--> statement-breakpoint
CREATE FUNCTION "public"."set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "user_set_updated_at"
BEFORE UPDATE ON "user"
FOR EACH ROW
EXECUTE FUNCTION "public"."set_updated_at"();