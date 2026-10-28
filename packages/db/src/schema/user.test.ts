import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { user, userRole, userStatus } from "./user.js"

describe("user table", () => {
  it("defines the requested columns", () => {
    expect(Object.keys(getTableColumns(user)).sort()).toEqual([
      "createdAt",
      "email",
      "emailVerified",
      "id",
      "image",
      "jobTitle",
      "name",
      "role",
      "status",
      "twoFactorEnabled",
      "updatedAt",
    ])
  })

  it("limits role and status to the allowed values", () => {
    expect(userRole.enumValues).toEqual(["admin", "operator", "viewer"])
    expect(userStatus.enumValues).toEqual(["active", "deactivated"])
  })
})
