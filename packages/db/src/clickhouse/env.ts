import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const emailHubEnvPath = path.resolve(
  packageDir,
  "../../../../apps/email-hub/.env"
)

export const CLICKHOUSE_DATABASE = "emailhub" as const
export const CLICKHOUSE_MIGRATIONS_TABLE = "schema_migrations" as const

export function clickhouseUrlFromEmailHub(): string | undefined {
  if (!fs.existsSync(emailHubEnvPath)) {
    return undefined
  }

  const parsed = parseEnv(fs.readFileSync(emailHubEnvPath, "utf8"))
  const url = parsed.CLICKHOUSE_URL?.trim()
  return url ? url : undefined
}

export function resolveClickHouseUrl(): string {
  const fromEnvFile = clickhouseUrlFromEmailHub()
  const ambient = process.env.CLICKHOUSE_URL?.trim()

  if (ambient && fromEnvFile && ambient !== fromEnvFile) {
    throw new Error(
      "CLICKHOUSE_URL in the process environment does not match apps/email-hub/.env. Refusing to choose a database."
    )
  }

  const url = ambient ?? fromEnvFile
  if (!url) {
    throw new Error(
      "CLICKHOUSE_URL is not configured. Set it in apps/email-hub/.env (and optionally the process environment)."
    )
  }

  assertClickHouseUrl(url)
  return url
}

export function assertClickHouseUrl(connectionString: string): void {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error("CLICKHOUSE_URL must be a valid HTTP(S) URL.")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CLICKHOUSE_URL must use the http or https protocol.")
  }
}
