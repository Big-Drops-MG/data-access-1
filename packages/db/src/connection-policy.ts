// Loopback is the local trust boundary. It covers Postgres on this machine and an
// SSH tunnel bound to 127.0.0.1, such as 127.0.0.1:15432. SSH encrypts that path.
// A real remote host is never treated as loopback and must use sslmode=verify-full.
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
  if (!isLoopback(url) && url.searchParams.get("sslmode") !== "verify-full") {
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
  if (isLoopback(url)) {
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

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(normalizeHost(url))
}

function normalizeHost(url: URL): string {
  return decodeURIComponent(url.hostname)
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
}
