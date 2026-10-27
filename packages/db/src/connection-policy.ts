// Trusted without TLS:
// - Loopback (local Postgres or SSH tunnel on 127.0.0.1)
// - Single-label Docker/Coolify DNS (postgres, gdhbxcx…, clickhouse)
// - RFC1918 private IPs on the compose/Coolify network
// Public hosts (DNS with a dot, or public IPs) must use sslmode=verify-full.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

export const APPLICATION_ROLE_NAME = "emailhub_app"

export type DatabaseUrlIdentity = {
  username: string
  password: string
  database: string
  host: string
  port: string
}

export function assertDatabaseUrl(connectionString: string): URL {
  const url = parseDatabaseUrl(connectionString)
  if (
    !isTrustedWithoutTls(url) &&
    url.searchParams.get("sslmode") !== "verify-full"
  ) {
    throw new Error(
      "DATABASE_URL for a non-local host must set sslmode=verify-full."
    )
  }

  return url
}

export function assertApplicationDatabaseUrl(connectionString: string): void {
  const url = parseDatabaseUrl(connectionString)
  if (isSuperuser(url)) {
    throw new Error(
      "DATABASE_URL must not use the PostgreSQL superuser role. Use a dedicated application role."
    )
  }

  assertDatabaseUrl(connectionString)

  if (
    decodeURIComponent(url.username).toLowerCase() !== APPLICATION_ROLE_NAME
  ) {
    throw new Error(`DATABASE_URL must use the ${APPLICATION_ROLE_NAME} role.`)
  }
}

export function databaseUrlIdentity(
  connectionString: string
): DatabaseUrlIdentity {
  const url = assertDatabaseUrl(connectionString)
  const username = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (!username || !password || !database || database.includes("/")) {
    throw new Error(
      "Database URL must include a username, password, and database name."
    )
  }

  return {
    username,
    password,
    database,
    host: normalizeHost(url),
    port: url.port || "5432",
  }
}

export function sslForDatabaseUrl(
  connectionString: string
): { rejectUnauthorized: true } | undefined {
  const url = assertDatabaseUrl(connectionString)
  if (isTrustedWithoutTls(url)) {
    return undefined
  }

  return { rejectUnauthorized: true }
}

export function sslForApplicationUrl(
  connectionString: string
): { rejectUnauthorized: true } | undefined {
  assertApplicationDatabaseUrl(connectionString)
  return sslForDatabaseUrl(connectionString)
}

function parseDatabaseUrl(connectionString: string): URL {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.")
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql protocol.")
  }

  return url
}

function isSuperuser(url: URL): boolean {
  return decodeURIComponent(url.username).toLowerCase() === "postgres"
}

/** Docker Compose / Coolify private network — TLS is not offered on these hosts. */
function isTrustedWithoutTls(url: URL): boolean {
  const host = normalizeHost(url)
  if (LOOPBACK_HOSTS.has(host)) {
    return true
  }
  // Single-label hostname: docker DNS / Coolify resource id (e.g. postgres, abc123xyz).
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

function normalizeHost(url: URL): string {
  return decodeURIComponent(url.hostname)
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
}
