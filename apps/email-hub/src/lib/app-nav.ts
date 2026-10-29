import type { AppRole } from "@/lib/permissions"
import { ROLE_RANK } from "@/lib/permissions"

export type AppNavTab = {
  title: string
  href: string
  documentTitle: string
}

export type AppAdminNavItem = {
  title: string
  href: string
  documentTitle: string
  minRole: AppRole
}

/** Primary tabs in SD#12.3 order (Admin is separate). */
export const APP_PRIMARY_TABS = [
  { title: "Dashboard", href: "/dashboard", documentTitle: "Dashboard" },
  { title: "Sends", href: "/sends", documentTitle: "Sends" },
  { title: "Templates", href: "/templates", documentTitle: "Templates" },
  {
    title: "Email routes",
    href: "/email-routes",
    documentTitle: "Email routes",
  },
  { title: "Recipients", href: "/recipients", documentTitle: "Recipients" },
  { title: "Suppression", href: "/suppression", documentTitle: "Suppression" },
  { title: "Domains", href: "/domains", documentTitle: "Domains" },
  { title: "Senders", href: "/senders", documentTitle: "Senders" },
  { title: "Feedback", href: "/feedback", documentTitle: "Feedback" },
  { title: "Alerts", href: "/alerts", documentTitle: "Alerts" },
  { title: "Reports", href: "/reports", documentTitle: "Reports" },
] as const satisfies readonly AppNavTab[]

/** Admin dropdown items (SD#12.3). Viewer never sees the menu. */
export const APP_ADMIN_NAV_ITEMS = [
  {
    title: "Audit log",
    href: "/admin/audit-log",
    documentTitle: "Audit log",
    minRole: "operator",
  },
  {
    title: "API clients",
    href: "/admin/api-clients",
    documentTitle: "API clients",
    minRole: "admin",
  },
  {
    title: "Users",
    href: "/admin/users",
    documentTitle: "Users",
    minRole: "admin",
  },
  {
    title: "Queues",
    href: "/admin/queues",
    documentTitle: "Queues",
    minRole: "admin",
  },
] as const satisfies readonly AppAdminNavItem[]

/** Alias used by page title helpers. */
export const APP_MODULE_PAGES = APP_PRIMARY_TABS

export type AppModulePage = (typeof APP_PRIMARY_TABS)[number]

export function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isAdminSectionActive(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/")
}

/** Operator and Admin see the Admin control; Viewer does not (T-044). */
export function canSeeAdminNav(role: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.operator
}

export function visibleAdminNavItems(role: AppRole): AppAdminNavItem[] {
  if (!canSeeAdminNav(role)) {
    return []
  }
  return APP_ADMIN_NAV_ITEMS.filter(
    (item) => ROLE_RANK[role] >= ROLE_RANK[item.minRole]
  )
}
