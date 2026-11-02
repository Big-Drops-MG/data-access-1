import { randomBytes } from "node:crypto"

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  applyAppRole,
  quoteIdentifier,
  sqlClientFromPg,
} from "../src/app-role.js"
import {
  APPLICATION_ROLE_NAME,
  databaseUrlIdentity,
  sslForDatabaseUrl,
} from "../src/connection-policy.js"
import * as schema from "../src/schema/index.js"
import { createDomain, createMessage, createSender } from "./factories.js"

const migrationUrl = process.env.DATABASE_MIGRATION_URL?.trim() ?? ""

describe.skipIf(migrationUrl.length === 0)("database factories", () => {
  const scratchName = `eh_factory_${randomBytes(4).toString("hex")}`
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

  it("builds a message and points the template at that version", async () => {
    if (!app) {
      throw new Error("application connection was not opened")
    }

    const db = drizzle({ client: app, schema })
    const row = await createMessage(db)
    const linked = await app.query<{
      template_version_id: string
      current_version_id: string
      sender_id: string
      recipient_id: string
      domain_id: string
    }>(
      `SELECT message.template_version_id,
              template.current_version_id,
              message.sender_id,
              message.recipient_id,
              sender.domain_id
       FROM message
       JOIN template_version ON template_version.id = message.template_version_id
       JOIN template ON template.id = template_version.template_id
       JOIN sender ON sender.id = message.sender_id
       WHERE message.id = $1`,
      [row.id]
    )

    expect(row.status).toBe("queued")
    expect(row.skipReason).toBeNull()
    expect(linked.rows[0]?.current_version_id).toBe(row.templateVersionId)
    expect(linked.rows[0]?.sender_id).toBe(row.senderId)
    expect(linked.rows[0]?.recipient_id).toBe(row.recipientId)
    expect(linked.rows[0]?.domain_id).toEqual(expect.any(String))
  })

  it("fills a skip reason when the message is skipped", async () => {
    if (!app) {
      throw new Error("application connection was not opened")
    }

    const row = await createMessage(drizzle({ client: app, schema }), {
      status: "skipped",
    })

    expect(row.status).toBe("skipped")
    expect(row.skipReason).toBe("frequency_cap")
  })

  it("uses the domain and sender values passed in", async () => {
    if (!app) {
      throw new Error("application connection was not opened")
    }

    const db = drizzle({ client: app, schema })
    const createdDomain = await createDomain(db, {
      name: "overrides.example.com",
      status: "verified",
    })
    const createdSender = await createSender(db, {
      domainId: createdDomain.id,
      fromEmail: "hello@overrides.example.com",
      fromName: "Overrides",
    })

    expect(createdDomain.name).toBe("overrides.example.com")
    expect(createdSender.domainId).toBe(createdDomain.id)
    expect(createdSender.fromEmail).toBe("hello@overrides.example.com")
    expect(createdSender.fromName).toBe("Overrides")
  })

  it("creates two messages without reusing a unique key", async () => {
    if (!app) {
      throw new Error("application connection was not opened")
    }

    const db = drizzle({ client: app, schema })
    const first = await createMessage(db)
    const second = await createMessage(db)

    expect(first.id).not.toBe(second.id)
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey)
    expect(first.recipientId).not.toBe(second.recipientId)
  })
})

const scratchSchema = [
  "CREATE EXTENSION IF NOT EXISTS citext",
  "CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer')",
  "CREATE TYPE user_status AS ENUM ('active', 'deactivated')",
  "CREATE TYPE email_category_kind AS ENUM ('transactional', 'relationship')",
  "CREATE TYPE email_type AS ENUM ('thank_you', 'feedback_request', 'engagement')",
  "CREATE TYPE domain_status AS ENUM ('pending', 'verifying', 'verified', 'failed', 'inactive')",
  "CREATE TYPE sender_status AS ENUM ('active', 'inactive', 'pending_verification')",
  "CREATE TYPE template_status AS ENUM ('draft', 'active', 'archived')",
  "CREATE TYPE recipient_tier AS ENUM ('standard', 'premium')",
  "CREATE TYPE recipient_status AS ENUM ('active', 'bounced')",
  "CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'complained', 'skipped', 'failed')",
  "CREATE TYPE message_skip_reason AS ENUM ('recipient_bounced', 'suppressed', 'opted_out', 'not_premium', 'collision', 'frequency_cap', 'no_route')",
  "CREATE TYPE audit_actor_type AS ENUM ('user', 'api_client', 'system')",
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
     key text NOT NULL UNIQUE,
     name text NOT NULL,
     description text,
     kind email_category_kind NOT NULL,
     default_opted_in boolean NOT NULL DEFAULT true,
     is_active boolean NOT NULL DEFAULT true,
     created_by uuid REFERENCES "user" (id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE domain (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     ses_identity_arn text,
     status domain_status NOT NULL DEFAULT 'pending',
     created_by uuid REFERENCES "user" (id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     verified_at timestamptz
   )`,
  `CREATE UNIQUE INDEX domain_name_unique ON domain (lower(name))`,
  `CREATE TABLE sender (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     domain_id uuid NOT NULL REFERENCES domain (id) ON DELETE RESTRICT,
     from_name text NOT NULL,
     from_email citext NOT NULL UNIQUE,
     reply_to citext,
     status sender_status NOT NULL DEFAULT 'pending_verification',
     version integer NOT NULL DEFAULT 1,
     created_by uuid REFERENCES "user" (id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     deactivated_at timestamptz
   )`,
  `CREATE TABLE template (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL UNIQUE,
     email_type email_type NOT NULL,
     category_id uuid NOT NULL REFERENCES email_category (id),
     current_version_id uuid,
     status template_status NOT NULL,
     created_by uuid NOT NULL REFERENCES "user" (id),
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
     created_by uuid NOT NULL REFERENCES "user" (id),
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT template_version_no_positive CHECK (version_no > 0),
     UNIQUE (template_id, version_no),
     UNIQUE (id, template_id)
   )`,
  `ALTER TABLE template
     ADD CONSTRAINT template_current_version_same_template_fk
     FOREIGN KEY (current_version_id, id)
     REFERENCES template_version (id, template_id)`,
  `CREATE TABLE recipient (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email citext NOT NULL UNIQUE,
     email_hash text NOT NULL UNIQUE,
     external_user_id text,
     tier recipient_tier NOT NULL DEFAULT 'standard',
     tier_updated_at timestamptz NOT NULL DEFAULT now(),
     status recipient_status NOT NULL DEFAULT 'active',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     last_emailed_at timestamptz
   )`,
  `CREATE TABLE message (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     send_id uuid,
     recipient_id uuid NOT NULL REFERENCES recipient (id),
     offer_id uuid,
     email_type email_type NOT NULL,
     template_version_id uuid REFERENCES template_version (id),
     sender_id uuid REFERENCES sender (id),
     idempotency_key text NOT NULL UNIQUE,
     status message_status NOT NULL,
     skip_reason message_skip_reason,
     failure_reason text,
     ses_message_id text,
     queued_at timestamptz,
     sent_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT message_skip_reason_check CHECK (
       (status = 'skipped' AND skip_reason IS NOT NULL)
       OR (status <> 'skipped' AND skip_reason IS NULL)
     )
   )`,
  `CREATE TABLE audit_log (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_type audit_actor_type NOT NULL,
     actor_id uuid,
     action text NOT NULL,
     entity_type text NOT NULL
   )`,
]

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
