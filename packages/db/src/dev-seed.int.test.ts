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
      recipients: 3,
    })
    expect(await counts(app)).toEqual(first)

    await app.query(
      "UPDATE email_category SET name = 'changed' WHERE key = 'thank_you'"
    )
    await seedDev(db)

    expect(await counts(app)).toEqual(first)
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
     status offer_status NOT NULL DEFAULT 'active',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX offer_external_ref_unique ON offer (external_ref)",
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
  `CREATE TABLE audit_log (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_type audit_actor_type NOT NULL,
     actor_id uuid,
     action text NOT NULL,
     entity_type text NOT NULL
   )`,
]

async function counts(client: Client): Promise<{
  categories: number
  frequencyRules: number
  offers: number
  recipients: number
}> {
  const result = await client.query<{
    categories: number
    frequency_rules: number
    offers: number
    recipients: number
  }>(
    `SELECT
       (SELECT count(*) FROM email_category) AS categories,
       (SELECT count(*) FROM frequency_rule) AS frequency_rules,
       (SELECT count(*) FROM offer) AS offers,
       (SELECT count(*) FROM recipient) AS recipients`
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
