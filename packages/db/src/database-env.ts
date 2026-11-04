import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

import {
  assertApplicationDatabaseUrl,
  assertDatabaseUrl,
  databaseUrlIdentity,
} from "./connection-policy.js"

const sourceDir = path.dirname(fileURLToPath(import.meta.url))

export const dbPackageDir = path.resolve(sourceDir, "..")

export const emailHubEnvPath = path.resolve(
  sourceDir,
  "../../../apps/email-hub/.env"
)

export type DatabaseUrlValues = {
  DATABASE_URL?: string
  DATABASE_MIGRATION_URL?: string
}

export function loadDatabaseEnv(): {
  applicationUrl: string
  migrationUrl: string
} {
  return databaseEnvFromValues(readEmailHubEnv(), {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
  })
}

export function databaseEnvFromValues(
  fileValues: DatabaseUrlValues,
  ambient: DatabaseUrlValues
): { applicationUrl: string; migrationUrl: string } {
  const applicationUrl = matchedUrl(
    "DATABASE_URL",
    fileValues.DATABASE_URL,
    ambient.DATABASE_URL
  )
  const migrationUrl = matchedUrl(
    "DATABASE_MIGRATION_URL",
    fileValues.DATABASE_MIGRATION_URL,
    ambient.DATABASE_MIGRATION_URL
  )

  assertApplicationDatabaseUrl(applicationUrl)
  assertDatabaseUrl(migrationUrl)

  const application = databaseUrlIdentity(applicationUrl)
  const migration = databaseUrlIdentity(migrationUrl)
  if (application.username.toLowerCase() === migration.username.toLowerCase()) {
    throw new Error(
      "DATABASE_URL and DATABASE_MIGRATION_URL must use different roles."
    )
  }

  if (
    application.host !== migration.host ||
    application.port !== migration.port ||
    application.database !== migration.database
  ) {
    throw new Error(
      "DATABASE_URL and DATABASE_MIGRATION_URL must point at the same database host, port, and name."
    )
  }

  return { applicationUrl, migrationUrl }
}

function matchedUrl(
  name: string,
  fileValue: string | undefined,
  ambientValue: string | undefined
): string {
  const fromFile = fileValue?.trim()
  if (!fromFile) {
    throw new Error(
      `apps/email-hub/.env must set ${name}. Drizzle does not read a root .env file.`
    )
  }

  const ambient = ambientValue?.trim()
  if (ambient && ambient !== fromFile) {
    throw new Error(
      `${name} in the process environment does not match apps/email-hub/.env. Refusing to choose a database.`
    )
  }

  return fromFile
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function readEmailHubEnv(): DatabaseUrlValues {
  if (!fs.existsSync(emailHubEnvPath)) {
    return {}
  }

  const parsed = parseEnv(stripBom(fs.readFileSync(emailHubEnvPath, "utf8")))
  return {
    DATABASE_URL: parsed.DATABASE_URL,
    DATABASE_MIGRATION_URL: parsed.DATABASE_MIGRATION_URL,
  }
}
