import { createClient, type ClickHouseClient } from "@clickhouse/client"

import {
  CLICKHOUSE_DATABASE,
  CLICKHOUSE_MIGRATIONS_TABLE,
  resolveClickHouseUrl,
} from "./env.js"
import {
  listClickHouseMigrationFiles,
  splitSqlStatements,
  type ClickHouseMigrationFile,
  clickhouseMigrationsDir,
} from "./migrations.js"

export type ClickHouseMigrateResult = {
  applied: string[]
  skipped: string[]
}

type AppliedRow = {
  version: string
  checksum: string
}

export async function migrateClickHouse(options?: {
  url?: string
  migrationsDir?: string
}): Promise<ClickHouseMigrateResult> {
  const url = options?.url ?? resolveClickHouseUrl()
  const migrationsDir = options?.migrationsDir ?? clickhouseMigrationsDir()
  const migrations = listClickHouseMigrationFiles(migrationsDir)

  const admin = createClient({ url })
  try {
    await admin.command({
      query: `CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE}`,
    })
  } finally {
    await admin.close()
  }

  const client = createClient({
    url,
    database: CLICKHOUSE_DATABASE,
  })

  try {
    await ensureMigrationsTable(client)
    const appliedRows = await loadAppliedMigrations(client)
    const appliedByVersion = new Map(
      appliedRows.map((row) => [row.version, row] as const)
    )

    const applied: string[] = []
    const skipped: string[] = []

    for (const migration of migrations) {
      const existing = appliedByVersion.get(migration.version)
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `ClickHouse migration ${migration.filename} was already applied with a different checksum. Never edit a shipped migration.`
          )
        }
        skipped.push(migration.filename)
        continue
      }

      await applyMigration(client, migration)
      applied.push(migration.filename)
    }

    return { applied, skipped }
  } finally {
    await client.close()
  }
}

async function ensureMigrationsTable(client: ClickHouseClient): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_DATABASE}.${CLICKHOUSE_MIGRATIONS_TABLE}
      (
        version String,
        checksum String,
        applied_at DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree
      ORDER BY version
    `,
  })
}

async function loadAppliedMigrations(
  client: ClickHouseClient
): Promise<AppliedRow[]> {
  const result = await client.query({
    query: `
      SELECT version, checksum
      FROM ${CLICKHOUSE_DATABASE}.${CLICKHOUSE_MIGRATIONS_TABLE}
      ORDER BY version
    `,
    format: "JSONEachRow",
  })
  return result.json<AppliedRow>()
}

async function applyMigration(
  client: ClickHouseClient,
  migration: ClickHouseMigrationFile
): Promise<void> {
  const statements = splitSqlStatements(migration.sql)
  if (statements.length === 0) {
    throw new Error(
      `ClickHouse migration ${migration.filename} has no executable statements.`
    )
  }

  for (const statement of statements) {
    await client.command({ query: statement })
  }

  await client.command({
    query: `
      INSERT INTO ${CLICKHOUSE_DATABASE}.${CLICKHOUSE_MIGRATIONS_TABLE}
        (version, checksum)
      VALUES ({version:String}, {checksum:String})
    `,
    query_params: {
      version: migration.version,
      checksum: migration.checksum,
    },
  })
}
