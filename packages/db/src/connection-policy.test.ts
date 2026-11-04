import { describe, expect, it } from "vitest"

import {
  assertApplicationDatabaseUrl,
  databaseUrlIdentity,
  sslForApplicationUrl,
} from "./connection-policy.js"

const localUrl = "postgresql://emailhub_app:secret@localhost:5432/emailhub"
const remoteUrl =
  "postgresql://emailhub_app:secret@db.example:5432/emailhub?sslmode=verify-full"

describe("application database URL policy", () => {
  it("allows the application role on loopback without TLS", () => {
    expect(() => assertApplicationDatabaseUrl(localUrl)).not.toThrow()
    expect(sslForApplicationUrl(localUrl)).toBeUndefined()
  })

  it("treats the SSH tunnel endpoint as loopback", () => {
    const tunnelUrl =
      "postgresql://emailhub_app:secret@127.0.0.1:15432/emailhub"

    expect(() => assertApplicationDatabaseUrl(tunnelUrl)).not.toThrow()
    expect(sslForApplicationUrl(tunnelUrl)).toBeUndefined()
  })

  it("allows Coolify/Docker single-label hosts without TLS", () => {
    const coolifyUrl =
      "postgresql://emailhub_app:secret@gdhbxcxcr2rsyc9fimbllnvu:5432/emailhub"

    expect(() => assertApplicationDatabaseUrl(coolifyUrl)).not.toThrow()
    expect(sslForApplicationUrl(coolifyUrl)).toBeUndefined()
  })

  it("allows RFC1918 private IPs without TLS", () => {
    const privateUrl =
      "postgresql://emailhub_app:secret@172.18.0.3:5432/emailhub"

    expect(() => assertApplicationDatabaseUrl(privateUrl)).not.toThrow()
    expect(sslForApplicationUrl(privateUrl)).toBeUndefined()
  })

  it("rejects the migration login as DATABASE_URL", () => {
    expect(() =>
      assertApplicationDatabaseUrl(
        "postgresql://emailhub:secret@localhost:5432/emailhub"
      )
    ).toThrow(/emailhub_app/)
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
        "postgresql://emailhub_app:secret@db.example:5432/emailhub"
      )
    ).toThrow(/sslmode=verify-full/)
    expect(() =>
      assertApplicationDatabaseUrl(
        "postgresql://emailhub_app:secret@db.example:5432/emailhub?sslmode=require"
      )
    ).toThrow(/sslmode=verify-full/)
  })

  it("reads the login, password, and database from a URL", () => {
    expect(
      databaseUrlIdentity(
        "postgresql://emailhub_app:p%40ss%3Aword@127.0.0.1/emailhub"
      )
    ).toMatchObject({
      username: "emailhub_app",
      password: "p@ss:word",
      database: "emailhub",
      host: "127.0.0.1",
      port: "5432",
    })
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
