import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { Client } from "pg"

const BREAKPOINT = "--> statement-breakpoint"
const TEMPLATE_VERSION_FK = "template_current_version_same_template_fk"
const TEMPLATE_VERSION_UNIQUE = "template_version_id_template_unique"

export type PostgresMigration = {
  tag: string
  statements: string[]
  folderMillis: number
  hash: string
}

type MigrationJournal = {
  entries: {
    tag: string
    when: number
    breakpoints: boolean
  }[]
}

export function readPostgresMigrations(
  migrationsFolder = defaultMigrationsFolder()
): PostgresMigration[] {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json")
  const journal = JSON.parse(
    fs.readFileSync(journalPath, "utf8")
  ) as MigrationJournal

  return journal.entries.map((entry) => {
    const migrationPath = path.join(migrationsFolder, `${entry.tag}.sql`)
    const query = fs.readFileSync(migrationPath, "utf8")
    return {
      tag: entry.tag,
      statements: query.split(BREAKPOINT),
      folderMillis: entry.when,
      hash: crypto.createHash("sha256").update(query).digest("hex"),
    }
  })
}

// 0002 adds template_current_version_same_template_fk before the unique
// index Postgres requires. Keep the shipped file and apply the index first.
export function orderMigrationStatements(
  statements: readonly string[]
): string[] {
  const next = [...statements]
  const foreignKeyIndex = next.findIndex((statement) =>
    statement.includes(TEMPLATE_VERSION_FK)
  )
  const uniqueIndex = next.findIndex((statement) =>
    statement.includes(TEMPLATE_VERSION_UNIQUE)
  )
  if (
    foreignKeyIndex === -1 ||
    uniqueIndex === -1 ||
    foreignKeyIndex > uniqueIndex
  ) {
    return next
  }

  const [foreignKey] = next.splice(foreignKeyIndex, 1)
  const uniqueAt = next.findIndex((statement) =>
    statement.includes(TEMPLATE_VERSION_UNIQUE)
  )
  if (!foreignKey || uniqueAt === -1) {
    return next
  }

  next.splice(uniqueAt + 1, 0, foreignKey)
  return next
}

export async function applyPostgresMigrations(
  client: Client,
  migrationsFolder = defaultMigrationsFolder()
): Promise<{ applied: number }> {
  const migrations = readPostgresMigrations(migrationsFolder)
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle")
  await client.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`
  )

  const existing = await client.query<{ created_at: string | number | null }>(
    "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1"
  )
  const lastCreatedAt = existing.rows[0]?.created_at
  const lastMillis = lastCreatedAt == null ? undefined : Number(lastCreatedAt)

  await client.query("BEGIN")
  let applied = 0
  try {
    for (const migration of migrations) {
      if (lastMillis !== undefined && lastMillis >= migration.folderMillis) {
        continue
      }

      for (const statement of orderMigrationStatements(migration.statements)) {
        if (statement.trim().length === 0) {
          continue
        }

        try {
          await client.query(statement)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new Error(
            `Postgres migration ${migration.tag} failed: ${message}`,
            { cause: error }
          )
        }
      }

      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [migration.hash, migration.folderMillis]
      )
      applied += 1
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }

  return { applied }
}

function defaultMigrationsFolder(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../drizzle"
  )
}
