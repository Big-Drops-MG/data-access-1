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
import { applyPostgresMigrations } from "../src/postgres-migrate.js"
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
    await applyPostgresMigrations(scratchOwner)

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
  }, 60_000)

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
