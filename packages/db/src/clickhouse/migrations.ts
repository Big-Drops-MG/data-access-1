import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const MIGRATION_FILE_PATTERN = /^(\d{4})_.+\.sql$/

export type ClickHouseMigrationFile = {
  version: string
  filename: string
  absolutePath: string
  sql: string
  checksum: string
}

export function clickhouseMigrationsDir(
  packageRoot = defaultPackageRoot()
): string {
  return path.join(packageRoot, "clickhouse")
}

function defaultPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
}

export function listClickHouseMigrationFiles(
  migrationsDir = clickhouseMigrationsDir()
): ClickHouseMigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return []
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b, "en"))

  const seenVersions = new Set<string>()
  const migrations: ClickHouseMigrationFile[] = []

  for (const filename of files) {
    const match = MIGRATION_FILE_PATTERN.exec(filename)
    const version = match?.[1]
    if (!version) {
      continue
    }

    if (seenVersions.has(version)) {
      throw new Error(
        `Duplicate ClickHouse migration version ${version} in ${migrationsDir}.`
      )
    }
    seenVersions.add(version)

    const absolutePath = path.join(migrationsDir, filename)
    const sql = fs.readFileSync(absolutePath, "utf8")
    migrations.push({
      version,
      filename,
      absolutePath,
      sql,
      checksum: checksumSql(sql),
    })
  }

  return migrations
}

export function checksumSql(sql: string): string {
  return crypto.createHash("sha256").update(normalizeSql(sql)).digest("hex")
}

function normalizeSql(sql: string): string {
  return sql.replace(/\r\n/g, "\n").trim()
}

export function splitSqlStatements(sql: string): string[] {
  const chunks = normalizeSql(sql).split(/;\s*(?:\n|$)/)
  const statements: string[] = []

  for (const chunk of chunks) {
    const statement = chunk
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim()
        return trimmed.length > 0 && !trimmed.startsWith("--")
      })
      .join("\n")
      .trim()

    if (statement.length > 0) {
      statements.push(statement)
    }
  }

  return statements
}
