import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { sslForApplicationUrl } from "./connection-policy.js"
import * as schema from "./schema/index.js"

let pool: Pool | undefined
let database: NodePgDatabase<typeof schema> | undefined

export function getPool(): Pool {
  if (pool) {
    return pool
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Set it before initializing the database client."
    )
  }

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...sslOption(connectionString),
  })

  return pool
}

function sslOption(
  connectionString: string
): { ssl: { rejectUnauthorized: true } } | Record<string, never> {
  const ssl = sslForApplicationUrl(connectionString)
  return ssl ? { ssl } : {}
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!database) {
    database = drizzle({ client: getPool(), schema })
  }

  return database
}
