import type { Client, QueryResultRow } from "pg"

import { APPLICATION_ROLE_NAME } from "./connection-policy.js"

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const ROLE_ATTRIBUTES =
  "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION"

export type SqlClient = {
  query: (
    statement: string,
    values?: readonly unknown[]
  ) => Promise<{ rows: readonly Record<string, unknown>[] }>
}

export function sqlClientFromPg(client: Client): SqlClient {
  return {
    async query(statement, values) {
      const result = await client.query<QueryResultRow>(
        statement,
        values ? [...values] : undefined
      )
      return { rows: result.rows }
    },
  }
}

export function quoteIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`)
  }

  return `"${value}"`
}

export function createAppRoleStatement(
  roleName: string,
  password: string
): string {
  assertRoleName(roleName)
  assertPassword(password)
  return `CREATE ROLE ${quoteIdentifier(roleName)} WITH ${ROLE_ATTRIBUTES} PASSWORD ${quoteLiteral(password)}`
}

export function alterAppRoleStatement(
  roleName: string,
  password: string
): string {
  assertRoleName(roleName)
  assertPassword(password)
  return `ALTER ROLE ${quoteIdentifier(roleName)} WITH ${ROLE_ATTRIBUTES} PASSWORD ${quoteLiteral(password)}`
}

export function grantAppRoleStatements(
  roleName: string,
  databaseName: string
): string[] {
  assertRoleName(roleName)
  const role = quoteIdentifier(roleName)
  const database = quoteIdentifier(databaseName)
  return [
    `ALTER ROLE ${role} SET search_path = public`,
    `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    `REVOKE ALL ON TABLE public.audit_log FROM ${role}`,
    `GRANT SELECT, INSERT ON TABLE public.audit_log TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ${role}`,
  ]
}

export async function applyAppRole(
  client: SqlClient,
  input: { password: string; databaseName: string }
): Promise<void> {
  assertPassword(input.password)
  quoteIdentifier(input.databaseName)

  const relation = await client.query(
    "SELECT to_regclass('public.audit_log') AS audit_log"
  )
  if (!relation.rows[0]?.audit_log) {
    throw new Error(
      "public.audit_log does not exist. Apply database migrations before granting the application role."
    )
  }

  const existing = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1) AS role_exists",
    [APPLICATION_ROLE_NAME]
  )
  const roleExists = existing.rows[0]?.role_exists === true
  await client.query(
    roleExists
      ? alterAppRoleStatement(APPLICATION_ROLE_NAME, input.password)
      : createAppRoleStatement(APPLICATION_ROLE_NAME, input.password)
  )

  for (const statement of grantAppRoleStatements(
    APPLICATION_ROLE_NAME,
    input.databaseName
  )) {
    await client.query(statement)
  }
}

export async function assertAppRolePrivileges(
  client: SqlClient
): Promise<void> {
  const result = await client.query(
    `SELECT
       rolsuper,
       rolcreatedb,
       rolcreaterole,
       rolinherit,
       rolbypassrls,
       rolreplication,
       has_table_privilege(current_user, 'public.audit_log', 'SELECT') AS can_select,
       has_table_privilege(current_user, 'public.audit_log', 'INSERT') AS can_insert,
       has_table_privilege(current_user, 'public.audit_log', 'UPDATE') AS can_update,
       has_table_privilege(current_user, 'public.audit_log', 'DELETE') AS can_delete,
       has_table_privilege(current_user, 'public.audit_log', 'TRUNCATE') AS can_truncate,
       (
         SELECT pg_get_userbyid(pg_class.relowner) = current_user
         FROM pg_catalog.pg_class
         JOIN pg_catalog.pg_namespace
           ON pg_namespace.oid = pg_class.relnamespace
         WHERE pg_namespace.nspname = 'public'
           AND pg_class.relname = 'audit_log'
       ) AS owns_audit_log
     FROM pg_catalog.pg_roles
     WHERE rolname = current_user`
  )
  const row = result.rows[0]
  if (!row) {
    throw new Error("Could not read the current database role.")
  }

  const elevated = [
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolinherit",
    "rolbypassrls",
    "rolreplication",
  ]
  if (elevated.some((column) => requireBoolean(row[column], column))) {
    throw new Error(
      `${APPLICATION_ROLE_NAME} must be a login with no superuser, createdb, createrole, inherit, bypassrls, or replication.`
    )
  }

  if (
    !requireBoolean(row.can_select, "can_select") ||
    !requireBoolean(row.can_insert, "can_insert")
  ) {
    throw new Error(
      `${APPLICATION_ROLE_NAME} must be able to select and insert audit_log.`
    )
  }

  if (
    requireBoolean(row.can_update, "can_update") ||
    requireBoolean(row.can_delete, "can_delete") ||
    requireBoolean(row.can_truncate, "can_truncate")
  ) {
    throw new Error(
      `${APPLICATION_ROLE_NAME} must not update, delete, or truncate audit_log.`
    )
  }

  if (requireBoolean(row.owns_audit_log, "owns_audit_log")) {
    throw new Error(`${APPLICATION_ROLE_NAME} must not own audit_log.`)
  }
}

function assertRoleName(roleName: string): void {
  if (roleName !== APPLICATION_ROLE_NAME) {
    throw new Error(`The application role name is ${APPLICATION_ROLE_NAME}.`)
  }
}

function assertPassword(password: string): void {
  if (password.length === 0 || password.includes("\0")) {
    throw new Error("Application role password must not be empty.")
  }
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Expected a boolean for ${label}.`)
  }

  return value
}
