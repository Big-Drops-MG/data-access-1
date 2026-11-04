import { randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { Client } from "pg"

import { applyAppRole, quoteIdentifier, sqlClientFromPg } from "./app-role.js"
import {
  APPLICATION_ROLE_NAME,
  assertApplicationDatabaseUrl,
  databaseUrlIdentity,
  sslForDatabaseUrl,
} from "./connection-policy.js"
import {
  type DatabaseUrlValues,
  databaseEnvFromValues,
  emailHubEnvPath,
  loadDatabaseEnv,
} from "./database-env.js"
import { applyPostgresMigrations } from "./postgres-migrate.js"

const TEMPLATE_PREFIX = "eh_tpl_"
const WORKER_PREFIX = "eh_w_"
const TEMPLATE_LOCK = 814032
const MAINTENANCE_DATABASE = "postgres"
const URLS_KEY = "__emailhubTestDatabaseUrls"
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])
const ORPHAN_PREFIX = "emailhub-test-run-"

type OrphanState = {
  pid: number
  templateName: string
}

type TestDatabaseUrls = {
  applicationUrl: string
  migrationUrl: string
}

export function rememberTestDatabaseUrls(urls: TestDatabaseUrls): void {
  ;(globalThis as typeof globalThis & { [URLS_KEY]?: TestDatabaseUrls })[
    URLS_KEY
  ] = urls
}

export function resolveTestDatabaseUrls(): TestDatabaseUrls | null {
  const remembered = (
    globalThis as typeof globalThis & { [URLS_KEY]?: TestDatabaseUrls }
  )[URLS_KEY]
  if (remembered) {
    return remembered
  }

  const ambient = {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
  }
  if (!fs.existsSync(emailHubEnvPath)) {
    return testDatabaseUrlsFrom(null, ambient)
  }

  return loadDatabaseEnv()
}

export function testDatabaseUrlsFrom(
  fileValues: DatabaseUrlValues | null,
  ambient: DatabaseUrlValues
): { applicationUrl: string; migrationUrl: string } | null {
  if (!fileValues) {
    if (
      !ambient.DATABASE_URL?.trim() ||
      !ambient.DATABASE_MIGRATION_URL?.trim()
    ) {
      return null
    }

    return databaseEnvFromValues(
      {
        DATABASE_URL: ambient.DATABASE_URL,
        DATABASE_MIGRATION_URL: ambient.DATABASE_MIGRATION_URL,
      },
      ambient
    )
  }

  return databaseEnvFromValues(fileValues, ambient)
}

export function withDatabase(
  connectionString: string,
  database: string
): string {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}

export function loopbackTestDatabase(connectionString: string): boolean {
  return LOOPBACK_HOSTS.has(databaseUrlIdentity(connectionString).host)
}

export async function createMigratedTemplate(input: {
  migrationUrl: string
  applicationUrl: string
}): Promise<{ name: string }> {
  assertLoopback(input.migrationUrl)
  assertApplicationDatabaseUrl(input.applicationUrl)
  const name = `${TEMPLATE_PREFIX}${randomBytes(6).toString("hex")}`
  const admin = await connect(
    withDatabase(input.migrationUrl, MAINTENANCE_DATABASE)
  )

  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`)
  } finally {
    await admin.end()
  }

  let database: Client | undefined
  try {
    database = await connect(withDatabase(input.migrationUrl, name))
    await applyPostgresMigrations(database)
    await applyAppRole(sqlClientFromPg(database), {
      password: databaseUrlIdentity(input.applicationUrl).password,
      databaseName: name,
    })
    await database.end()
    database = undefined

    const sealer = await connect(
      withDatabase(input.migrationUrl, MAINTENANCE_DATABASE)
    )
    try {
      await terminateConnections(sealer, name)
      await sealer.query(
        `ALTER DATABASE ${quoteIdentifier(name)} WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`
      )
    } finally {
      await sealer.end()
    }
  } catch (error) {
    await database?.end()
    await dropTestDatabase(input.migrationUrl, name)
    throw error
  }

  return { name }
}

export async function cloneMigratedTemplate(input: {
  migrationUrl: string
  applicationUrl: string
  templateName: string
  workerId: string
}): Promise<{ name: string; applicationUrl: string }> {
  assertLoopback(input.migrationUrl)
  assertApplicationDatabaseUrl(input.applicationUrl)
  const token = templateToken(input.templateName)
  const name = `${WORKER_PREFIX}${token}_${safeWorkerId(input.workerId)}_${randomBytes(3).toString("hex")}`
  const admin = await connect(
    withDatabase(input.migrationUrl, MAINTENANCE_DATABASE)
  )

  try {
    await admin.query("SELECT pg_advisory_lock($1)", [TEMPLATE_LOCK])
    try {
      await createFromTemplate(admin, name, input.templateName)
    } finally {
      await admin.query("SELECT pg_advisory_unlock($1)", [TEMPLATE_LOCK])
    }

    await admin.query(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(name)} TO ${quoteIdentifier(APPLICATION_ROLE_NAME)}`
    )
  } catch (error) {
    await admin.end()
    await dropTestDatabase(input.migrationUrl, name)
    throw error
  }
  await admin.end()

  return {
    name,
    applicationUrl: withDatabase(input.applicationUrl, name),
  }
}

export async function dropTestDatabase(
  migrationUrl: string,
  name: string
): Promise<void> {
  const admin = await connect(withDatabase(migrationUrl, MAINTENANCE_DATABASE))
  try {
    await dropDatabase(admin, name)
  } finally {
    await admin.end()
  }
}

export async function reapOrphanedTestDatabases(
  migrationUrl: string
): Promise<void> {
  let names: string[]
  try {
    names = fs.readdirSync(os.tmpdir())
  } catch {
    return
  }

  for (const name of names) {
    if (!name.startsWith(ORPHAN_PREFIX) || !name.endsWith(".json")) {
      continue
    }

    const statePath = path.join(os.tmpdir(), name)
    const state = readOrphanState(statePath)
    if (!state || state.pid === process.pid || pidAlive(state.pid)) {
      continue
    }

    await dropMigratedTemplate({
      migrationUrl,
      templateName: state.templateName,
    })
    fs.rmSync(statePath, { force: true })
  }
}

export function rememberTestDatabaseRun(templateName: string): void {
  const state: OrphanState = { pid: process.pid, templateName }
  fs.writeFileSync(orphanStatePath(templateName), JSON.stringify(state), "utf8")
}

export function forgetTestDatabaseRun(templateName: string): void {
  fs.rmSync(orphanStatePath(templateName), { force: true })
}

export async function dropMigratedTemplate(input: {
  migrationUrl: string
  templateName: string
}): Promise<void> {
  const token = templateToken(input.templateName)
  const admin = await connect(
    withDatabase(input.migrationUrl, MAINTENANCE_DATABASE)
  )

  try {
    const workers = await admin.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE starts_with(datname, $1)",
      [`${WORKER_PREFIX}${token}_`]
    )
    for (const row of workers.rows) {
      await dropDatabase(admin, row.datname)
    }
    await dropDatabase(admin, input.templateName)
  } finally {
    await admin.end()
  }
}

async function createFromTemplate(
  admin: Client,
  name: string,
  templateName: string
): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await terminateConnections(admin, templateName)
    try {
      await admin.query(
        `CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE ${quoteIdentifier(templateName)}`
      )
      return
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : ""
      if (!message.includes("being accessed by other users")) {
        throw error
      }
      await delay(100 * (attempt + 1))
    }
  }

  throw lastError
}

async function dropDatabase(admin: Client, name: string): Promise<void> {
  const existing = await admin.query<{ datistemplate: boolean }>(
    "SELECT datistemplate FROM pg_database WHERE datname = $1",
    [name]
  )
  const row = existing.rows[0]
  if (!row) {
    return
  }

  if (row.datistemplate) {
    await admin.query(
      `ALTER DATABASE ${quoteIdentifier(name)} WITH IS_TEMPLATE false ALLOW_CONNECTIONS true`
    )
  }

  await admin.query(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`
  )
}

async function terminateConnections(
  admin: Client,
  databaseName: string
): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [databaseName]
  )
}

function orphanStatePath(templateName: string): string {
  return path.join(os.tmpdir(), `${ORPHAN_PREFIX}${templateName}.json`)
}

function readOrphanState(statePath: string): OrphanState | undefined {
  if (!fs.existsSync(statePath)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      pid?: unknown
      templateName?: unknown
    }
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.templateName !== "string" ||
      !parsed.templateName.startsWith(TEMPLATE_PREFIX)
    ) {
      return undefined
    }

    return { pid: parsed.pid, templateName: parsed.templateName }
  } catch {
    return undefined
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? error.code : ""
    return code === "EPERM"
  }
}

function assertLoopback(connectionString: string): void {
  if (!loopbackTestDatabase(connectionString)) {
    throw new Error(
      "Per-worker test databases only run against loopback Postgres."
    )
  }
}

function templateToken(templateName: string): string {
  if (!templateName.startsWith(TEMPLATE_PREFIX)) {
    throw new Error("Template database name is not an email hub test template.")
  }

  const token = templateName.slice(TEMPLATE_PREFIX.length)
  if (!/^[a-f0-9]+$/.test(token)) {
    throw new Error("Template database name is not an email hub test template.")
  }

  return token
}

function safeWorkerId(workerId: string): string {
  const cleaned = workerId.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24)
  if (!cleaned) {
    throw new Error("Vitest worker id is empty.")
  }

  return cleaned
}

async function connect(connectionString: string): Promise<Client> {
  const ssl = sslForDatabaseUrl(connectionString)
  const client = new Client({
    connectionString,
    ...(ssl ? { ssl } : {}),
  })
  await client.connect()
  return client
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}
