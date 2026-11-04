import path from "node:path"

import { defineConfig } from "drizzle-kit"

import { dbPackageDir, loadDatabaseEnv } from "./src/database-env.ts"

if (path.resolve(process.cwd()) !== path.resolve(dbPackageDir)) {
  throw new Error(
    "Run Drizzle from packages/db. Migration paths are relative to that package."
  )
}

const { migrationUrl } = loadDatabaseEnv()

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationUrl,
  },
  strict: true,
  verbose: true,
})
