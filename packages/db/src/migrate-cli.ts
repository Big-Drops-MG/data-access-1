import { Client } from "pg"

import { sslForDatabaseUrl } from "./connection-policy.js"
import { loadDatabaseEnv } from "./database-env.js"
import { applyPostgresMigrations } from "./postgres-migrate.js"

const { migrationUrl } = loadDatabaseEnv()
const ssl = sslForDatabaseUrl(migrationUrl)
const client = new Client({
  connectionString: migrationUrl,
  ...(ssl ? { ssl } : {}),
})

await client.connect()
try {
  const result = await applyPostgresMigrations(client)
  process.stdout.write(`Applied ${result.applied} postgres migrations.\n`)
} finally {
  await client.end()
}
