import { describe, expect, it } from "vitest"

import { APPLICATION_ROLE_NAME } from "./connection-policy.js"
import {
  loopbackTestDatabase,
  testDatabaseUrlsFrom,
  withDatabase,
} from "./test-database.js"

const applicationUrl = `postgresql://${APPLICATION_ROLE_NAME}:app-secret@127.0.0.1:5432/emailhub`
const migrationUrl =
  "postgresql://emailhub:owner-secret@127.0.0.1:5432/emailhub"

describe("test database urls", () => {
  it("uses the process environment when the env file is absent", () => {
    expect(
      testDatabaseUrlsFrom(null, {
        DATABASE_URL: applicationUrl,
        DATABASE_MIGRATION_URL: migrationUrl,
      })
    ).toEqual({
      applicationUrl,
      migrationUrl,
    })
  })

  it("skips when neither the env file nor the process environment is set", () => {
    expect(testDatabaseUrlsFrom(null, {})).toBeNull()
  })

  it("keeps the file and process environment on the same database", () => {
    expect(
      testDatabaseUrlsFrom(
        {
          DATABASE_URL: applicationUrl,
          DATABASE_MIGRATION_URL: migrationUrl,
        },
        {
          DATABASE_URL: applicationUrl,
          DATABASE_MIGRATION_URL: migrationUrl,
        }
      )
    ).toEqual({
      applicationUrl,
      migrationUrl,
    })
  })

  it("accepts loopback and rejects a public database host", () => {
    expect(loopbackTestDatabase(migrationUrl)).toBe(true)
    expect(
      loopbackTestDatabase(
        "postgresql://emailhub:owner-secret@db.example.com:5432/emailhub?sslmode=verify-full"
      )
    ).toBe(false)
  })

  it("replaces only the database name", () => {
    const url = new URL(withDatabase(applicationUrl, "eh_w_abc"))

    expect(url.pathname).toBe("/eh_w_abc")
    expect(url.username).toBe(APPLICATION_ROLE_NAME)
    expect(url.hostname).toBe("127.0.0.1")
  })
})
