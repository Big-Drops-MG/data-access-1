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
  it("matches the Figma bar and keeps Offers in the Admin menu", () => {
    expect(APP_PRIMARY_TABS.map((tab) => tab.title)).toEqual([
      "Dashboard",
      "Reports",
      "Sends",
      "Templates",
      "Routes",
      "Senders",
      "Domains",
      "Recipients",
      "Suppression",
      "Feedback",
      "Alerts",
    ])
    expect(APP_PRIMARY_TABS.map((tab) => tab.title)).not.toContain("Offers")
    expect(APP_PRIMARY_TABS.map((tab) => tab.title)).not.toContain("Admin")
    expect(APP_PRIMARY_TABS.find((tab) => tab.title === "Routes")?.href).toBe(
      "/email-routes"
    )
    expect(
      APP_ADMIN_NAV_ITEMS.find((item) => item.title === "Offers")?.href
    ).toBe("/offers")
  })
})

describe("isPathActive", () => {
  it("highlights exact and nested paths", () => {
    expect(isPathActive("/sends", "/sends")).toBe(true)
    expect(isPathActive("/sends/abc", "/sends")).toBe(true)
    expect(isPathActive("/senders", "/sends")).toBe(false)
    expect(isPathActive("/dashboard", "/sends")).toBe(false)
    expect(isPathActive("/suppression/unsubscribe", "/suppression")).toBe(true)
    expect(isPathActive("/feedback/complaints", "/feedback")).toBe(true)
    expect(isPathActive("/complaints/abc", "/feedback")).toBe(true)
    expect(isPathActive("/unsubscribe", "/suppression")).toBe(true)
  })
})

describe("isAdminSectionActive", () => {
  it("highlights /admin paths and Offers", () => {
    expect(isAdminSectionActive("/admin/audit-log")).toBe(true)
    expect(isAdminSectionActive("/admin/users")).toBe(true)
    expect(isAdminSectionActive("/offers")).toBe(true)
    expect(isAdminSectionActive("/offers/new")).toBe(true)
    expect(isAdminSectionActive("/dashboard")).toBe(false)
  })
})

describe("Admin role visibility (T-044 Done When)", () => {
  it("hides Admin entirely from viewers", () => {
    expect(canSeeAdminNav("viewer")).toBe(false)
    expect(visibleAdminNavItems("viewer")).toEqual([])
  })

  it("shows Offers and Audit log to operators", () => {
    expect(canSeeAdminNav("operator")).toBe(true)
    expect(visibleAdminNavItems("operator").map((item) => item.title)).toEqual([
      "Offers",
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
