import { createRequire } from "node:module"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const require = createRequire(
  fileURLToPath(
    new URL("../../../../packages/db/package.json", import.meta.url)
  )
)
const pg = require("pg")
const { applyPostgresMigrations } =
  await import("../../../../packages/db/dist/postgres-migrate.js")
const { grantAppRoleStatements, quoteIdentifier } =
  await import("../../../../packages/db/dist/app-role.js")
const { APPLICATION_ROLE_NAME, databaseUrlIdentity } =
  await import("../../../../packages/db/dist/connection-policy.js")

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"])
const TARGET_DATABASE = process.env.E2E_DATABASE_NAME || "emailhub_e2e"

function readEnvFile() {
  const raw = fs.readFileSync(
    fileURLToPath(new URL("../../.env", import.meta.url)),
    "utf8"
  )
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }
    const eq = trimmed.indexOf("=")
    if (eq <= 0) {
      continue
    }
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function withDatabase(connectionString, database) {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}

export async function provisionE2eDatabase() {
  const file = readEnvFile()
  const migrationUrl = file.DATABASE_MIGRATION_URL
  const applicationUrl = file.DATABASE_URL
  if (!migrationUrl || !applicationUrl) {
    throw new Error("apps/email-hub/.env is missing database URLs.")
  }
  const migration = databaseUrlIdentity(migrationUrl)
  const application = databaseUrlIdentity(applicationUrl)
  if (!LOOPBACK.has(migration.host) || !LOOPBACK.has(application.host)) {
    throw new Error("Refusing to provision E2E outside loopback Postgres.")
  }
  if (migration.database === TARGET_DATABASE) {
    throw new Error("Migration URL already points at the E2E database.")
  }

  const admin = new pg.Client({ connectionString: migrationUrl })
  await admin.connect()
  try {
    const existing = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TARGET_DATABASE]
    )
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(TARGET_DATABASE)}`)
    }
  } finally {
    await admin.end()
  }

  const target = new pg.Client({
    connectionString: withDatabase(migrationUrl, TARGET_DATABASE),
  })
  await target.connect()
  try {
    const migrated = await applyPostgresMigrations(target)
    const role = await target.query(
      "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1",
      [APPLICATION_ROLE_NAME]
    )
    if (role.rowCount === 0) {
      throw new Error(
        `${APPLICATION_ROLE_NAME} does not exist. Provision the local app role before the E2E database.`
      )
    }
    for (const statement of grantAppRoleStatements(
      APPLICATION_ROLE_NAME,
      TARGET_DATABASE
    )) {
      await target.query(statement)
    }
    process.stdout.write(
      `e2e database ready name=${TARGET_DATABASE} applied=${migrated.applied}\n`
    )
  } finally {
    await target.end()
  }

  return {
    databaseUrl: withDatabase(applicationUrl, TARGET_DATABASE),
    migrationUrl: withDatabase(migrationUrl, TARGET_DATABASE),
  }
}
