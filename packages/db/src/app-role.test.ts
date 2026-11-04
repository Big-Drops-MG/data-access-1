import { describe, expect, it } from "vitest"

import { APPLICATION_ROLE_NAME } from "./connection-policy.js"
import {
  alterAppRoleStatement,
  applyAppRole,
  createAppRoleStatement,
  grantAppRoleStatements,
  type SqlClient,
} from "./app-role.js"

const password = "s'ecret"

describe("application role statements", () => {
  it("creates a login with no elevated attributes", () => {
    const statement = createAppRoleStatement(APPLICATION_ROLE_NAME, password)

    expect(statement).toContain("NOSUPERUSER")
    expect(statement).toContain("NOCREATEDB")
    expect(statement).toContain("NOCREATEROLE")
    expect(statement).toContain("NOINHERIT")
    expect(statement).toContain("NOBYPASSRLS")
    expect(statement).toContain("NOREPLICATION")
    expect(statement).toContain("'s''ecret'")
    expect(statement).not.toContain(password)
  })

  it("resets attributes when the role already exists", () => {
    expect(alterAppRoleStatement(APPLICATION_ROLE_NAME, "secret")).toMatch(
      /^ALTER ROLE "emailhub_app" WITH LOGIN NOSUPERUSER /
    )
  })

  it("grants ordinary table writes and keeps audit_log append-only", () => {
    const statements = grantAppRoleStatements(APPLICATION_ROLE_NAME, "emailhub")
    const sql = statements.join("\n")
    const grantTables = sql.indexOf(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"
    )
    const revokeAudit = sql.indexOf("REVOKE ALL ON TABLE public.audit_log")
    const grantAudit = sql.indexOf(
      "GRANT SELECT, INSERT ON TABLE public.audit_log"
    )

    expect(grantTables).toBeGreaterThan(-1)
    expect(revokeAudit).toBeGreaterThan(grantTables)
    expect(grantAudit).toBeGreaterThan(revokeAudit)
    expect(
      statements.some(
        (statement) =>
          statement.includes("ON TABLE public.audit_log") &&
          statement.includes("UPDATE")
      )
    ).toBe(false)
  })

  it("rejects a role name other than the application role", () => {
    expect(() => createAppRoleStatement("emailhub", "secret")).toThrow(
      /emailhub_app/
    )
  })

  it("rejects an empty password", () => {
    expect(() => createAppRoleStatement(APPLICATION_ROLE_NAME, "")).toThrow(
      /password/
    )
  })
})

describe("applyAppRole", () => {
  it("creates the role and grants only after audit_log exists", async () => {
    const client = fakeClient({ roleExists: false, auditLogExists: true })

    await applyAppRole(client, {
      password: "secret",
      databaseName: "emailhub",
    })

    expect(client.statements[0]).toContain("to_regclass")
    expect(client.statements[1]).toContain("pg_roles")
    expect(client.statements[2]).toMatch(/^CREATE ROLE/)
    expect(
      client.statements.some((statement) => statement.startsWith("GRANT"))
    ).toBe(true)
  })

  it("alters an existing role", async () => {
    const client = fakeClient({ roleExists: true, auditLogExists: true })

    await applyAppRole(client, {
      password: "secret",
      databaseName: "emailhub",
    })

    expect(client.statements[2]).toMatch(/^ALTER ROLE/)
  })

  it("does not grant when audit_log is missing", async () => {
    const client = fakeClient({ roleExists: false, auditLogExists: false })

    await expect(
      applyAppRole(client, { password: "secret", databaseName: "emailhub" })
    ).rejects.toThrow(/audit_log/)
    expect(client.statements).toHaveLength(1)
  })
})

function fakeClient(options: {
  roleExists: boolean
  auditLogExists: boolean
}): SqlClient & { statements: string[] } {
  const statements: string[] = []
  return {
    statements,
    async query(statement) {
      statements.push(statement)
      if (statement.includes("to_regclass")) {
        return {
          rows: [{ audit_log: options.auditLogExists ? "audit_log" : null }],
        }
      }
      if (statement.includes("pg_roles")) {
        return { rows: [{ role_exists: options.roleExists }] }
      }
      return { rows: [] }
    },
  }
}
