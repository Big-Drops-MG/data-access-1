import { randomBytes } from "node:crypto"

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { applyAppRole, quoteIdentifier, sqlClientFromPg } from "./app-role.js"
import {
  APPLICATION_ROLE_NAME,
  databaseUrlIdentity,
  sslForDatabaseUrl,
} from "./connection-policy.js"
import { seedDev } from "./dev-seed.js"
import * as schema from "./schema/index.js"

const migrationUrl = process.env.DATABASE_MIGRATION_URL?.trim() ?? ""

describe.skipIf(migrationUrl.length === 0)("dev seed", () => {
  const scratchName = `eh_seed_${randomBytes(4).toString("hex")}`
  const scratchIdent = quoteIdentifier(scratchName)
  let admin: Client | undefined
  let scratchOwner: Client | undefined
  let app: Client | undefined
  let created = false

  beforeAll(async () => {
    admin = new Client(clientConfig(migrationUrl))
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS ${scratchIdent} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${scratchIdent}`)
    created = true

    scratchOwner = new Client(
      clientConfig(withDatabase(migrationUrl, scratchName))
    )
    await scratchOwner.connect()
    for (const statement of scratchSchema) {
      await scratchOwner.query(statement)
    }

    const password = applicationPassword(migrationUrl)
    await applyAppRole(sqlClientFromPg(scratchOwner), {
      password,
      databaseName: scratchName,
    })

    app = new Client(
      clientConfig(
        withDatabase(applicationUrl(migrationUrl, password), scratchName)
      )
    )
    await app.connect()
  }, 30_000)

  afterAll(async () => {
    await app?.end()
    await scratchOwner?.end()
    if (created && admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${scratchIdent} WITH (FORCE)`)
    }
    await admin?.end()
  }, 30_000)

  it("inserts the catalog once and leaves later edits in place", async () => {
    if (!app) {
      throw new Error("application connection was not opened")
    }

    const db = drizzle({ client: app, schema })
    const first = await seedDev(db)
    expect(first).toEqual({
      categories: 3,
      frequencyRules: 2,
      offers: 1,
      recipients: 0,
      messages: 0,
      feedbackClassifications: 4,
    })
    expect(await counts(app)).toMatchObject({
      categories: 3,
      frequencyRules: 2,
      offers: 1,
      recipients: 0,
      messages: 0,
      feedbackClassifications: 4,
    })

    await app.query(
      "UPDATE email_category SET name = 'changed' WHERE key = 'thank_you'"
    )
    const second = await seedDev(db)
    expect(second.messages).toBe(0)
    expect(await counts(app)).toMatchObject({
      categories: 3,
      frequencyRules: 2,
      offers: 1,
      recipients: 0,
      messages: 0,
      feedbackClassifications: 4,
    })
    const renamed = await app.query<{ name: string }>(
      "SELECT name FROM email_category WHERE key = 'thank_you'"
    )
    expect(renamed.rows[0]?.name).toBe("changed")

    const rules = await app.query<{ kind: string; category_id: string | null }>(
      "SELECT kind, category_id FROM frequency_rule ORDER BY kind"
    )
    expect(rules.rows).toEqual([
      { kind: "cap", category_id: null },
      { kind: "collision", category_id: null },
    ])
  })
})

const scratchSchema = [
  "CREATE EXTENSION IF NOT EXISTS citext",
  "CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer')",
  "CREATE TYPE user_status AS ENUM ('active', 'deactivated')",
  "CREATE TYPE email_category_kind AS ENUM ('transactional', 'relationship')",
  "CREATE TYPE email_type AS ENUM ('thank_you', 'feedback_request', 'engagement')",
  "CREATE TYPE frequency_rule_kind AS ENUM ('cap', 'collision')",
  "CREATE TYPE offer_status AS ENUM ('active', 'inactive')",
  "CREATE TYPE recipient_tier AS ENUM ('standard', 'premium')",
  "CREATE TYPE recipient_status AS ENUM ('active', 'bounced')",
  `CREATE TYPE audit_actor_type AS ENUM ('user', 'api_client', 'system')`,
  `CREATE TABLE "user" (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email citext NOT NULL,
     name text NOT NULL,
     email_verified boolean NOT NULL DEFAULT false,
     image text,
     role user_role NOT NULL,
     job_title text,
     status user_status NOT NULL,
     two_factor_enabled boolean NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX user_email_unique ON "user" (email)`,
  `CREATE TABLE email_category (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     key text NOT NULL,
     name text NOT NULL,
     description text,
     kind email_category_kind NOT NULL,
     default_opted_in boolean NOT NULL DEFAULT true,
     is_active boolean NOT NULL DEFAULT true,
     created_by uuid REFERENCES "user" (id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX email_category_key_unique ON email_category (key)",
  `CREATE TABLE frequency_rule (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     kind frequency_rule_kind NOT NULL,
     category_id uuid REFERENCES email_category (id),
     max_count integer,
     window_days integer,
     blocks_with_type email_type,
     min_gap_hours integer,
     version integer NOT NULL DEFAULT 1,
     updated_by uuid NOT NULL REFERENCES "user" (id),
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT frequency_rule_version_positive CHECK (version > 0),
     CONSTRAINT frequency_rule_numbers_check CHECK (
       (max_count IS NULL OR max_count > 0)
       AND (window_days IS NULL OR window_days > 0)
       AND (min_gap_hours IS NULL OR min_gap_hours >= 0)
       AND (
         (kind = 'cap' AND max_count IS NOT NULL AND window_days IS NOT NULL)
         OR (kind = 'collision' AND blocks_with_type IS NOT NULL AND min_gap_hours IS NOT NULL)
       )
     )
   )`,
  `CREATE UNIQUE INDEX frequency_rule_kind_category_unique
     ON frequency_rule (kind, category_id) WHERE category_id IS NOT NULL`,
  `CREATE UNIQUE INDEX frequency_rule_kind_global_unique
     ON frequency_rule (kind) WHERE category_id IS NULL`,
  `CREATE TABLE offer (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     external_ref text NOT NULL,
     everflow_offer_id integer,
     status offer_status NOT NULL DEFAULT 'active',
     approved_subject_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
     approved_from_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
     tracking_links jsonb DEFAULT NULL,
     creatives jsonb NOT NULL DEFAULT '[]'::jsonb,
     unsubscribe_url text,
     suppression_file_url text,
     optizmo_mailer_access_key_encrypted text,
     has_optizmo_mailer_access_key boolean NOT NULL DEFAULT false,
     last_synced_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX offer_external_ref_unique ON offer (external_ref)",
  "CREATE UNIQUE INDEX offer_everflow_offer_id_unique ON offer (everflow_offer_id)",
  "CREATE INDEX offer_status_idx ON offer (status)",
  `CREATE TABLE recipient (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email citext NOT NULL,
     email_hash text NOT NULL,
     external_user_id text,
     tier recipient_tier NOT NULL DEFAULT 'standard',
     tier_updated_at timestamptz NOT NULL DEFAULT now(),
     status recipient_status NOT NULL DEFAULT 'active',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     last_emailed_at timestamptz
   )`,
  "CREATE UNIQUE INDEX recipient_email_unique ON recipient (email)",
  "CREATE UNIQUE INDEX recipient_email_hash_unique ON recipient (email_hash)",
  "CREATE TYPE recipient_preference_source AS ENUM ('unsubscribe_link', 'preference_center', 'admin', 'system', 'import')",
  `CREATE TABLE recipient_preference (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     recipient_id uuid NOT NULL REFERENCES recipient (id) ON DELETE CASCADE,
     category_id uuid NOT NULL REFERENCES email_category (id) ON DELETE CASCADE,
     opted_out boolean NOT NULL DEFAULT false,
     source recipient_preference_source NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX recipient_preference_recipient_category_unique ON recipient_preference (recipient_id, category_id)",
  "CREATE TYPE domain_status AS ENUM ('pending', 'verifying', 'verified', 'failed', 'inactive')",
  `CREATE TABLE domain (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     ses_identity_arn text,
     status domain_status NOT NULL DEFAULT 'pending',
     offer_id uuid REFERENCES offer (id) ON DELETE SET NULL,
     created_by uuid REFERENCES "user" (id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     verified_at timestamptz
   )`,
  "CREATE UNIQUE INDEX domain_name_unique ON domain (lower(name))",
  "CREATE TYPE sender_status AS ENUM ('active', 'inactive', 'pending_verification')",
  `CREATE TABLE sender (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     domain_id uuid NOT NULL REFERENCES domain (id) ON DELETE RESTRICT,
     from_name text NOT NULL,
     from_email citext NOT NULL,
     reply_to citext,
     postal_address text,
     status sender_status NOT NULL DEFAULT 'pending_verification',
     version integer NOT NULL DEFAULT 1,
     offer_id uuid REFERENCES offer (id) ON DELETE SET NULL,
     created_by uuid REFERENCES "user" (id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     deactivated_at timestamptz
   )`,
  "CREATE UNIQUE INDEX sender_from_email_unique ON sender (from_email)",
  "CREATE TYPE template_status AS ENUM ('draft', 'active', 'archived')",
  `CREATE TABLE template (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     email_type email_type NOT NULL,
     category_id uuid NOT NULL REFERENCES email_category (id) ON DELETE RESTRICT,
     current_version_id uuid,
     status template_status NOT NULL,
     offer_id uuid REFERENCES offer (id) ON DELETE SET NULL,
     created_by uuid NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE template_version (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     template_id uuid NOT NULL REFERENCES template (id) ON DELETE CASCADE,
     version_no integer NOT NULL,
     subject text NOT NULL,
     body_source text NOT NULL,
     merge_tags jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_by uuid NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX template_version_template_version_no_unique ON template_version (template_id, version_no)",
  "CREATE TYPE message_status AS ENUM ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'skipped', 'failed')",
  "CREATE TYPE message_environment AS ENUM ('production', 'test')",
  "CREATE TYPE message_skip_reason AS ENUM ('recipient_bounced', 'suppressed', 'opted_out', 'not_premium', 'collision', 'frequency_cap', 'no_route')",
  `CREATE TABLE message (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     send_id uuid,
     recipient_id uuid NOT NULL REFERENCES recipient (id) ON DELETE RESTRICT,
     offer_id uuid REFERENCES offer (id) ON DELETE RESTRICT,
     email_type email_type NOT NULL,
     template_version_id uuid REFERENCES template_version (id) ON DELETE RESTRICT,
     sender_id uuid REFERENCES sender (id) ON DELETE RESTRICT,
     idempotency_key text NOT NULL,
     environment message_environment NOT NULL DEFAULT 'production',
     merge_data jsonb NOT NULL DEFAULT '{}'::jsonb,
     status message_status NOT NULL,
     skip_reason message_skip_reason,
     failure_reason text,
     ses_message_id text,
     queued_at timestamptz,
     sent_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX message_idempotency_key_unique ON message (idempotency_key)",
  `CREATE TABLE audit_log (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_type audit_actor_type NOT NULL,
     actor_id uuid,
     action text NOT NULL,
     entity_type text NOT NULL
   )`,
  `CREATE TABLE feedback_classification (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     key text NOT NULL,
     label text NOT NULL,
     active boolean NOT NULL DEFAULT true,
     created_by uuid REFERENCES "user" (id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX feedback_classification_key_unique ON feedback_classification (key)",
  "CREATE INDEX feedback_classification_active_idx ON feedback_classification (active)",
]

async function counts(client: Client): Promise<{
  categories: number
  frequencyRules: number
  offers: number
  recipients: number
  messages: number
  feedbackClassifications: number
}> {
  const result = await client.query<{
    categories: number
    frequency_rules: number
    offers: number
    recipients: number
    messages: number
    feedback_classifications: number
  }>(
    `SELECT
       (SELECT count(*) FROM email_category) AS categories,
       (SELECT count(*) FROM frequency_rule) AS frequency_rules,
       (SELECT count(*) FROM offer) AS offers,
       (SELECT count(*) FROM recipient) AS recipients,
       (SELECT count(*) FROM message) AS messages,
       (SELECT count(*) FROM feedback_classification) AS feedback_classifications`
  )
  const row = result.rows[0]
  if (!row) {
    throw new Error("seed counts were not returned")
  }

  return {
    categories: Number(row.categories),
    frequencyRules: Number(row.frequency_rules),
    offers: Number(row.offers),
    recipients: Number(row.recipients),
    messages: Number(row.messages),
    feedbackClassifications: Number(row.feedback_classifications),
  }
}

function applicationPassword(ownerUrl: string): string {
  const configured = process.env.DATABASE_URL?.trim()
  if (!configured) {
    return databaseUrlIdentity(ownerUrl).password
  }

  const identity = databaseUrlIdentity(configured)
  if (identity.username.toLowerCase() !== APPLICATION_ROLE_NAME) {
    return databaseUrlIdentity(ownerUrl).password
  }

  return identity.password
}

function applicationUrl(ownerUrl: string, password: string): string {
  const url = new URL(ownerUrl)
  url.username = APPLICATION_ROLE_NAME
  url.password = password
  return url.toString()
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}

function clientConfig(connectionString: string): {
  connectionString: string
  ssl?: { rejectUnauthorized: true }
} {
  const ssl = sslForDatabaseUrl(connectionString)
  return ssl ? { connectionString, ssl } : { connectionString }
}
