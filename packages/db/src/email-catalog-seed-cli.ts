import { Client } from "pg"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"

import { sslForApplicationUrl } from "./connection-policy.js"
import { loadDatabaseEnv } from "./database-env.js"
import { seedEmailCatalog } from "./email-catalog-seed.js"
import { user } from "./schema/index.js"
import * as schema from "./schema/index.js"

const { applicationUrl } = loadDatabaseEnv()
const actorEmail = process.env.CATALOG_SEED_ACTOR_EMAIL?.trim().toLowerCase()

const ssl = sslForApplicationUrl(applicationUrl)
const client = new Client({
  connectionString: applicationUrl,
  ...(ssl ? { ssl } : {}),
})

await client.connect()
try {
  const db = drizzle({ client, schema })
  const [actor] = actorEmail
    ? await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.email, actorEmail),
            eq(user.role, "admin"),
            eq(user.status, "active")
          )
        )
        .limit(1)
    : await db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.role, "admin"), eq(user.status, "active")))
        .limit(1)

  if (!actor) {
    throw new Error(
      actorEmail
        ? `No active admin user found for CATALOG_SEED_ACTOR_EMAIL=${actorEmail}`
        : "No active admin user found to attribute catalog seed (set CATALOG_SEED_ACTOR_EMAIL)"
    )
  }

  const result = await seedEmailCatalog(db, { updatedByUserId: actor.id })
  process.stdout.write(
    `Email catalog v${result.version} seeded: ${result.categories} categories, ${result.frequencyRules} frequency rules.\n`
  )
} finally {
  await client.end()
}
