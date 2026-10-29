import { describe, expect, it } from "vitest"

import {
  APP_ADMIN_NAV_ITEMS,
  APP_PRIMARY_TABS,
  canSeeAdminNav,
  isAdminSectionActive,
  isPathActive,
  visibleAdminNavItems,
} from "@/lib/app-nav"

describe("APP_PRIMARY_TABS", () => {
  it("ships eleven tabs in SD#12.3 order", () => {
    expect(APP_PRIMARY_TABS.map((tab) => tab.title)).toEqual([
      "Dashboard",
      "Sends",
      "Templates",
      "Email routes",
      "Recipients",
      "Suppression",
      "Domains",
      "Senders",
      "Feedback",
      "Alerts",
      "Reports",
    ])
  })
})

describe("isPathActive", () => {
  it("highlights exact and nested paths", () => {
    expect(isPathActive("/sends", "/sends")).toBe(true)
    expect(isPathActive("/sends/abc", "/sends")).toBe(true)
    expect(isPathActive("/senders", "/sends")).toBe(false)
    expect(isPathActive("/dashboard", "/sends")).toBe(false)
  })
})

describe("isAdminSectionActive", () => {
  it("highlights any /admin path", () => {
    expect(isAdminSectionActive("/admin/audit-log")).toBe(true)
    expect(isAdminSectionActive("/admin/users")).toBe(true)
    expect(isAdminSectionActive("/dashboard")).toBe(false)
  })
})

describe("Admin role visibility (T-044 Done When)", () => {
  it("hides Admin entirely from viewers", () => {
    expect(canSeeAdminNav("viewer")).toBe(false)
    expect(visibleAdminNavItems("viewer")).toEqual([])
  })

  it("shows only Audit log to operators", () => {
    expect(canSeeAdminNav("operator")).toBe(true)
    expect(visibleAdminNavItems("operator").map((item) => item.title)).toEqual([
      "Audit log",
    ])
  })

  it("shows every Admin item to admins", () => {
    expect(canSeeAdminNav("admin")).toBe(true)
    expect(visibleAdminNavItems("admin").map((item) => item.title)).toEqual(
      APP_ADMIN_NAV_ITEMS.map((item) => item.title)
    )
  })
})
