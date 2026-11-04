import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { describe, expect, inject, it } from "vitest"

import { assertAppRolePrivileges, sqlClientFromPg } from "../src/app-role.js"
import {
  databaseUrlIdentity,
  sslForDatabaseUrl,
} from "../src/connection-policy.js"
import {
  applyPostgresMigrations,
  readPostgresMigrations,
} from "../src/postgres-migrate.js"
import * as schema from "../src/schema/index.js"
import {
  cloneMigratedTemplate,
  dropTestDatabase,
  resolveTestDatabaseUrls,
  withDatabase,
} from "../src/test-database.js"
import { createUser } from "./factories.js"

const templateName = inject("emailhubTemplateDatabase")

describe.skipIf(templateName.length === 0)(
  "per-worker migrated database",
  () => {
    it("gives each worker a private copy of the migrated template", async () => {
      const urls = resolveTestDatabaseUrls()
      const currentUrl = process.env.DATABASE_URL?.trim()
      if (!urls || !currentUrl) {
        throw new Error("Worker database URL was not configured.")
      }

      const current = databaseUrlIdentity(currentUrl)
      expect(current.database.startsWith("eh_w_")).toBe(true)
      expect(current.username).toBe("emailhub_app")

      const other = await cloneMigratedTemplate({
        migrationUrl: urls.migrationUrl,
        applicationUrl: urls.applicationUrl,
        templateName,
        workerId: "isolation",
      })
      const worker = await connect(currentUrl)
      const isolated = await connect(other.applicationUrl)
      const owner = await connect(
        withDatabase(urls.migrationUrl, current.database)
      )

      try {
        await assertAppRolePrivileges(sqlClientFromPg(worker))
        const migrations = await owner.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"
        )
        expect(Number(migrations.rows[0]?.count)).toBe(
          readPostgresMigrations().length
        )

        await createUser(drizzle({ client: worker, schema }), {
          email: "worker-a@example.com",
        })
        const copied = await isolated.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM "user"'
        )
        expect(Number(copied.rows[0]?.count)).toBe(0)

        const again = await applyPostgresMigrations(owner)
        expect(again.applied).toBe(0)
      } finally {
        await worker.end()
        await isolated.end()
        await owner.end()
        await dropTestDatabase(urls.migrationUrl, other.name)
      }
    }, 60_000)
  }
)

async function connect(connectionString: string): Promise<Client> {
  const ssl = sslForDatabaseUrl(connectionString)
  const client = new Client({
    connectionString,
    ...(ssl ? { ssl } : {}),
  })
  await client.connect()
  return client
}
