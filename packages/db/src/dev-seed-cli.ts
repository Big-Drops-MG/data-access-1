import { Client } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"

import { sslForApplicationUrl } from "./connection-policy.js"
import { loadDatabaseEnv } from "./database-env.js"
import { assertDevSeedTarget, seedDev } from "./dev-seed.js"
import * as schema from "./schema/index.js"

const { applicationUrl } = loadDatabaseEnv()
assertDevSeedTarget(applicationUrl)

const ssl = sslForApplicationUrl(applicationUrl)
const client = new Client({
  connectionString: applicationUrl,
  ...(ssl ? { ssl } : {}),
})

await client.connect()
try {
  const result = await seedDev(drizzle({ client, schema }))
  process.stdout.write(
    `Dev seed ready: ${result.categories} categories, ${result.frequencyRules} frequency rules, ${result.offers} offer, ${result.recipients} recipients.\n`
  )
} finally {
  await client.end()
}
