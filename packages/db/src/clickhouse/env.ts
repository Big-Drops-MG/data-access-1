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

  const text = fs.readFileSync(emailHubEnvPath, "utf8")
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const parsed = parseEnv(withoutBom)
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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

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

  if (url.protocol === "http:" && !isTrustedClickHouseHttpHost(url)) {
    throw new Error(
      "CLICKHOUSE_URL for a non-local host must use https (plain http is only allowed for loopback, Docker DNS, or private IPs)."
    )
  }
}

function isTrustedClickHouseHttpHost(url: URL): boolean {
  const host = decodeURIComponent(url.hostname)
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
  if (LOOPBACK_HOSTS.has(host)) {
    return true
  }
  if (!host.includes(".") && !host.includes(":")) {
    return true
  }
  return isPrivateIpv4(host)
}

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) {
    return false
  }
  const octets = match.slice(1, 5).map((part) => Number(part))
  const a = octets[0]
  const b = octets[1]
  if (
    a === undefined ||
    b === undefined ||
    octets[2] === undefined ||
    octets[3] === undefined ||
    octets.some((octet) => octet > 255)
  ) {
    return false
  }
  if (a === 10) {
    return true
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true
  }
  if (a === 192 && b === 168) {
    return true
  }
  return false
}
