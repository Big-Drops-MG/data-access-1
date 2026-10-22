// Loopback is the local trust boundary. It covers Postgres on this machine and an
// SSH tunnel bound to 127.0.0.1, such as 127.0.0.1:15432. SSH encrypts that path.
// A real remote host is never treated as loopback and must use sslmode=verify-full.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

export function assertApplicationDatabaseUrl(connectionString: string): void {
  const url = parseDatabaseUrl(connectionString)
  if (isSuperuser(url)) {
    throw new Error(
      "DATABASE_URL must not use the PostgreSQL superuser role. Use a dedicated application role."
    )
  }

  if (!isLoopback(url) && url.searchParams.get("sslmode") !== "verify-full") {
    throw new Error(
      "DATABASE_URL for a non-local host must set sslmode=verify-full."
    )
  }
}

export function sslForApplicationUrl(
  connectionString: string
): { rejectUnauthorized: true } | undefined {
  assertApplicationDatabaseUrl(connectionString)
  const url = parseDatabaseUrl(connectionString)
  if (isLoopback(url)) {
    return undefined
  }

  return { rejectUnauthorized: true }
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
  const host = decodeURIComponent(url.hostname)
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
  return LOOPBACK_HOSTS.has(host)
}
