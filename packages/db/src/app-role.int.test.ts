import { randomBytes } from "node:crypto"

import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  applyAppRole,
  assertAppRolePrivileges,
  quoteIdentifier,
  sqlClientFromPg,
} from "./app-role.js"
import {
  APPLICATION_ROLE_NAME,
  databaseUrlIdentity,
  sslForDatabaseUrl,
} from "./connection-policy.js"

const migrationUrl = process.env.DATABASE_MIGRATION_URL?.trim() ?? ""

describe.skipIf(migrationUrl.length === 0)(
  "application role privileges",
  () => {
    const scratchName = `eh_role_${randomBytes(4).toString("hex")}`
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
      const role = sqlClientFromPg(scratchOwner)
      await applyAppRole(role, { password, databaseName: scratchName })
      await applyAppRole(role, { password, databaseName: scratchName })

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
        await admin.query(
          `DROP DATABASE IF EXISTS ${scratchIdent} WITH (FORCE)`
        )
      }
      await admin?.end()
    }, 30_000)

    it("is not a superuser and can only insert and select audit_log", async () => {
      if (!app) {
        throw new Error("application connection was not opened")
      }

      await expect(
        assertAppRolePrivileges(sqlClientFromPg(app))
      ).resolves.toBeUndefined()
    })

    it("can write an ordinary table and cannot rewrite audit_log", async () => {
      if (!app) {
        throw new Error("application connection was not opened")
      }

      await app.query("INSERT INTO probe (id, note) VALUES (1, 'ok')")
      const updated = await app.query(
        "UPDATE probe SET note = 'edited' WHERE id = 1"
      )
      expect(updated.rowCount).toBe(1)
      await app.query("DELETE FROM probe WHERE id = 1")

      const inserted = await app.query<{ id: string }>(
        `INSERT INTO audit_log (actor_type, action, entity_type)
       VALUES ('system', 'app_role.test', 'app_role')
       RETURNING id`
      )
      const id = inserted.rows[0]?.id
      expect(id).toEqual(expect.any(String))

      const selected = await app.query(
        "SELECT action FROM audit_log WHERE id = $1",
        [id]
      )
      expect(selected.rows[0]?.action).toBe("app_role.test")

      await expectDenied(
        app.query("UPDATE audit_log SET action = 'tamper' WHERE id = $1", [id])
      )
      await expectDenied(app.query("DELETE FROM audit_log WHERE id = $1", [id]))
      await expectDenied(app.query("TRUNCATE audit_log"))
      await expectDenied(app.query("CREATE TABLE should_fail (id integer)"))
      await expectDenied(app.query("DROP TABLE audit_log"))
    })
  }
)

const scratchSchema = [
  `CREATE TYPE audit_actor_type AS ENUM ('user', 'api_client', 'system')`,
  `CREATE TABLE audit_log (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_type audit_actor_type NOT NULL,
     actor_id uuid,
     action text NOT NULL,
     entity_type text NOT NULL,
     CONSTRAINT audit_log_actor_id_check CHECK (
       (actor_type = 'system' AND actor_id IS NULL)
       OR (actor_type IN ('user', 'api_client') AND actor_id IS NOT NULL)
     )
   )`,
  `CREATE TABLE probe (
     id integer PRIMARY KEY,
     note text NOT NULL
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

async function expectDenied(pending: Promise<unknown>): Promise<void> {
  await expect(pending).rejects.toMatchObject({ code: "42501" })
}
