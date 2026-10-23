import { APIError } from "better-auth/api"
import { describe, expect, it } from "vitest"

import { parseAdminEmails } from "./admin-emails"
import {
  SIGN_IN_REJECTED_MESSAGE,
  assertActiveStaffForSession,
  mapGoogleProfileToUser,
  prepareBootstrapAdminUser,
} from "./auth-gates"

describe("mapGoogleProfileToUser", () => {
  it("maps a verified Workspace profile", () => {
    expect(
      mapGoogleProfileToUser({
        email: "Sami@BigDropsMarketing.com",
        name: "Sami",
        picture: "https://example.com/a.png",
        email_verified: true,
      })
    ).toEqual({
      email: "sami@bigdropsmarketing.com",
      name: "Sami",
      image: "https://example.com/a.png",
      emailVerified: true,
    })
  })

  it("rejects unverified email", () => {
    expect(() =>
      mapGoogleProfileToUser({
        email: "sami@bigdropsmarketing.com",
        email_verified: false,
      })
    ).toThrow(APIError)
    expect(() =>
      mapGoogleProfileToUser({
        email: "sami@bigdropsmarketing.com",
        email_verified: false,
      })
    ).toThrow(SIGN_IN_REJECTED_MESSAGE)
  })

  it("rejects off-domain email", () => {
    expect(() =>
      mapGoogleProfileToUser({
        email: "user@gmail.com",
        email_verified: true,
      })
    ).toThrow(APIError)
  })
})

describe("prepareBootstrapAdminUser", () => {
  const admins = parseAdminEmails("admin@bigdropsmarketing.com")

  it("promotes allowlisted Workspace emails to admin/active", () => {
    expect(
      prepareBootstrapAdminUser(
        {
          email: "Admin@BigDropsMarketing.com",
          name: "Admin",
        },
        admins
      )
    ).toEqual({
      data: {
        email: "admin@bigdropsmarketing.com",
        name: "Admin",
        role: "admin",
        status: "active",
        emailVerified: true,
      },
    })
  })

  it("rejects unknown or off-domain emails", () => {
    expect(() =>
      prepareBootstrapAdminUser(
        { email: "stranger@bigdropsmarketing.com", name: "X" },
        admins
      )
    ).toThrow(APIError)
    expect(() =>
      prepareBootstrapAdminUser({ email: "admin@gmail.com", name: "X" }, admins)
    ).toThrow(APIError)
  })
})

describe("assertActiveStaffForSession", () => {
  it("allows active Workspace users", () => {
    expect(() =>
      assertActiveStaffForSession({
        status: "active",
        email: "ops@bigdropsmarketing.com",
      })
    ).not.toThrow()
  })

  it("rejects missing, deactivated, or off-domain users", () => {
    expect(() => assertActiveStaffForSession(undefined)).toThrow(APIError)
    expect(() =>
      assertActiveStaffForSession({
        status: "deactivated",
        email: "ops@bigdropsmarketing.com",
      })
    ).toThrow(APIError)
    expect(() =>
      assertActiveStaffForSession({
        status: "active",
        email: "ops@gmail.com",
      })
    ).toThrow(APIError)
  })
})
