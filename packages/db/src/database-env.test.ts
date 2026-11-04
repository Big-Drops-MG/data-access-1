import { describe, expect, it } from "vitest"

import { APPLICATION_ROLE_NAME } from "./connection-policy.js"
import { databaseEnvFromValues } from "./database-env.js"

const applicationUrl = `postgresql://${APPLICATION_ROLE_NAME}:app-secret@127.0.0.1:5432/emailhub`
const migrationUrl =
  "postgresql://emailhub:owner-secret@127.0.0.1:5432/emailhub"

describe("database env", () => {
  it("accepts the application role and a distinct migration login on the same database", () => {
    expect(
      databaseEnvFromValues(
        {
          DATABASE_URL: applicationUrl,
          DATABASE_MIGRATION_URL: migrationUrl,
        },
        {}
      )
    ).toEqual({
      applicationUrl,
      migrationUrl,
    })
  })

  it("rejects a process environment URL that disagrees with the env file", () => {
    const ambient = `postgresql://${APPLICATION_ROLE_NAME}:other-secret@127.0.0.1:5432/emailhub`

    expect(() =>
      databaseEnvFromValues(
        {
          DATABASE_URL: applicationUrl,
          DATABASE_MIGRATION_URL: migrationUrl,
        },
        { DATABASE_URL: ambient }
      )
    ).toThrowError(/does not match/)
  })

  it("does not include a URL or password in a mismatch error", () => {
    expect(() =>
      databaseEnvFromValues(
        {
          DATABASE_URL: applicationUrl,
          DATABASE_MIGRATION_URL: migrationUrl,
        },
        { DATABASE_MIGRATION_URL: `${migrationUrl}?sslmode=disable` }
      )
    ).toThrowError(expect.not.stringContaining("owner-secret"))
  })

  it("requires the migration URL in the env file", () => {
    expect(() =>
      databaseEnvFromValues({ DATABASE_URL: applicationUrl }, {})
    ).toThrow(/DATABASE_MIGRATION_URL/)
  })

  it("rejects the owner login in DATABASE_URL", () => {
    expect(() =>
      databaseEnvFromValues(
        {
          DATABASE_URL: migrationUrl,
          DATABASE_MIGRATION_URL: migrationUrl,
        },
        {}
      )
    ).toThrow(/emailhub_app/)
  })

  it("rejects two URLs that name different databases", () => {
    const otherDatabase = new URL(applicationUrl)
    otherDatabase.pathname = "/other"

    expect(() =>
      databaseEnvFromValues(
        {
          DATABASE_URL: otherDatabase.toString(),
          DATABASE_MIGRATION_URL: migrationUrl,
        },
        {}
      )
    ).toThrow(/same database/)
  })
})
