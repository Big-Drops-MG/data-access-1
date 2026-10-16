import fs from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"
import { fileURLToPath } from "node:url"
import { defineConfig } from "drizzle-kit"
import { assertApplicationDatabaseUrl } from "./src/connection-policy.ts"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const emailHubEnvPath = path.resolve(packageDir, "../../apps/email-hub/.env")

function databaseUrlFromEmailHub(): string | undefined {
  if (!fs.existsSync(emailHubEnvPath)) {
    return undefined
  }

  const parsed = parseEnv(fs.readFileSync(emailHubEnvPath, "utf8"))
  const databaseUrl = parsed.DATABASE_URL?.trim()
  return databaseUrl ? databaseUrl : undefined
}

const databaseUrl = databaseUrlFromEmailHub()

if (!databaseUrl) {
  throw new Error(
    "apps/email-hub/.env must set DATABASE_URL. Drizzle does not read a root .env file."
  )
}

const ambientDatabaseUrl = process.env.DATABASE_URL?.trim()
if (ambientDatabaseUrl && ambientDatabaseUrl !== databaseUrl) {
  throw new Error(
    "DATABASE_URL in the process environment does not match apps/email-hub/.env. Refusing to choose a database."
  )
}

assertApplicationDatabaseUrl(databaseUrl)

if (path.resolve(process.cwd()) !== path.resolve(packageDir)) {
  throw new Error(
    "Run Drizzle from packages/db. Migration paths are relative to that package."
  )
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
})
