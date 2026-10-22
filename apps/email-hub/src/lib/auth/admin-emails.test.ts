import { describe, expect, it } from "vitest"

import {
  isAllowedSsoEmailDomain,
  isBootstrapAdminEmail,
  parseAdminEmails,
} from "./admin-emails"

describe("parseAdminEmails", () => {
  it("returns empty set for missing or blank input", () => {
    expect(parseAdminEmails(undefined).size).toBe(0)
    expect(parseAdminEmails(null).size).toBe(0)
    expect(parseAdminEmails("   ").size).toBe(0)
  })

  it("normalises and splits comma-separated emails", () => {
    const set = parseAdminEmails(" Admin@Example.COM , viewer@test.org ")
    expect(set.has("admin@example.com")).toBe(true)
    expect(set.has("viewer@test.org")).toBe(true)
    expect(set.size).toBe(2)
  })

  it("drops segments without @", () => {
    const set = parseAdminEmails("good@x.com,not-an-email,also@y.com")
    expect(set.size).toBe(2)
    expect(set.has("good@x.com")).toBe(true)
    expect(set.has("also@y.com")).toBe(true)
  })
})

describe("isAllowedSsoEmailDomain", () => {
  it("allows @bigdropsmarketing.com addresses", () => {
    expect(isAllowedSsoEmailDomain("Sami@BigDropsMarketing.com")).toBe(true)
  })

  it("rejects other domains and lookalikes", () => {
    expect(isAllowedSsoEmailDomain("user@gmail.com")).toBe(false)
    expect(isAllowedSsoEmailDomain("user@evilbigdropsmarketing.com")).toBe(
      false
    )
    expect(isAllowedSsoEmailDomain("user@mail.bigdropsmarketing.com")).toBe(
      false
    )
  })
})

describe("isBootstrapAdminEmail", () => {
  const allowlist = parseAdminEmails("admin@example.com")

  it("matches normalised allowlist emails", () => {
    expect(isBootstrapAdminEmail("Admin@Example.com", allowlist)).toBe(true)
  })

  it("rejects unknown emails", () => {
    expect(isBootstrapAdminEmail("stranger@example.com", allowlist)).toBe(false)
  })
})
