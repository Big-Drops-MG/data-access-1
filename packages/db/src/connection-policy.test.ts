import { describe, expect, it } from "vitest"

import {
  assertApplicationDatabaseUrl,
  sslForApplicationUrl,
} from "./connection-policy.js"

const localUrl = "postgresql://emailhub:secret@localhost:5432/emailhub"
const remoteUrl =
  "postgresql://emailhub:secret@db.example:5432/emailhub?sslmode=verify-full"

describe("application database URL policy", () => {
  it("allows a non-superuser loopback URL without TLS", () => {
    expect(() => assertApplicationDatabaseUrl(localUrl)).not.toThrow()
    expect(sslForApplicationUrl(localUrl)).toBeUndefined()
  })

  it("treats the SSH tunnel endpoint as loopback", () => {
    const tunnelUrl =
      "postgresql://emailhub_user:secret@127.0.0.1:15432/emailhub"

    expect(() => assertApplicationDatabaseUrl(tunnelUrl)).not.toThrow()
    expect(sslForApplicationUrl(tunnelUrl)).toBeUndefined()
  })

  it("rejects a public database host without verify-full", () => {
    expect(() =>
      assertApplicationDatabaseUrl(
        "postgresql://emailhub_user:secret@157.245.14.242:5432/emailhub"
      )
    ).toThrow(/sslmode=verify-full/)
  })

  it("rejects the PostgreSQL superuser role", () => {
    expect(() =>
      assertApplicationDatabaseUrl(
        "postgresql://postgres:secret@localhost:5432/postgres"
      )
    ).toThrow(/superuser/)
  })

  it("requires verify-full for a non-local host", () => {
    expect(() =>
      assertApplicationDatabaseUrl(
        "postgresql://emailhub:secret@db.example:5432/emailhub"
      )
    ).toThrow(/sslmode=verify-full/)
    expect(() =>
      assertApplicationDatabaseUrl(
        "postgresql://emailhub:secret@db.example:5432/emailhub?sslmode=require"
      )
    ).toThrow(/sslmode=verify-full/)
  })

  it("verifies the server certificate for an allowed remote URL", () => {
    expect(sslForApplicationUrl(remoteUrl)).toEqual({
      rejectUnauthorized: true,
    })
  })

  it("does not include the connection URL in policy errors", () => {
    expect(() =>
      assertApplicationDatabaseUrl(
        "postgresql://postgres:secret@db.example:5432/emailhub"
      )
    ).toThrowError(expect.not.stringContaining("secret"))
  })
})
