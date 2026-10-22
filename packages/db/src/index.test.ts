import { afterEach, describe, expect, it } from "vitest"

describe("@workspace/db", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl
    }
  })

  it("imports the package entry without a database connection", async () => {
    delete process.env.DATABASE_URL

    const databasePackage = await import("./index.js")

    expect(databasePackage.PACKAGE_NAME).toBe("@workspace/db")
    expect(databasePackage).not.toHaveProperty("db")
    expect(databasePackage).not.toHaveProperty("pool")
  }, 15_000)
})
