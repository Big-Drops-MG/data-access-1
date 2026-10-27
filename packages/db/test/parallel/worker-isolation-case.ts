import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { expect } from "vitest"

import {
  databaseUrlIdentity,
  sslForDatabaseUrl,
} from "../../src/connection-policy.js"
import * as schema from "../../src/schema/index.js"
import { createUser } from "../factories.js"
import { recordWorkerDatabase } from "../worker-manifest.js"

export async function expectPrivateWorkerDatabase(
  manifestPath: string
): Promise<string> {
  const currentUrl = process.env.DATABASE_URL?.trim()
  if (!currentUrl || !manifestPath) {
    throw new Error("Worker database URL was not configured.")
  }

  const database = databaseUrlIdentity(currentUrl).database
  expect(database.startsWith("eh_w_")).toBe(true)
  const email = `${database}@example.com`
  const client = await connect(currentUrl)

  try {
    await createUser(drizzle({ client, schema }), { email })
    const found = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM "user" WHERE email = $1',
      [email]
    )
    expect(Number(found.rows[0]?.count)).toBe(1)
    recordWorkerDatabase(manifestPath, database)
    return database
  } finally {
    await client.end()
  }
}

async function connect(connectionString: string): Promise<Client> {
  const ssl = sslForDatabaseUrl(connectionString)
  const client = new Client({
    connectionString,
    ...(ssl ? { ssl } : {}),
  })
  await client.connect()
  return client
}
