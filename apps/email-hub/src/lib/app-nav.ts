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

/** Primary tabs in the Figma bar order. Admin lives in the user menu. */
export const APP_PRIMARY_TABS = [
  { title: "Dashboard", href: "/dashboard", documentTitle: "Dashboard" },
  { title: "Reports", href: "/reports", documentTitle: "Reports" },
  { title: "Sends", href: "/sends", documentTitle: "Sends" },
  { title: "Templates", href: "/templates", documentTitle: "Templates" },
  { title: "Routes", href: "/email-routes", documentTitle: "Routes" },
  { title: "Senders", href: "/senders", documentTitle: "Senders" },
  { title: "Domains", href: "/domains", documentTitle: "Domains" },
  { title: "Recipients", href: "/recipients", documentTitle: "Recipients" },
  { title: "Suppression", href: "/suppression", documentTitle: "Suppression" },
  { title: "Feedback", href: "/feedback", documentTitle: "Feedback" },
  { title: "Alerts", href: "/alerts", documentTitle: "Alerts" },
] as const satisfies readonly AppNavTab[]

/** Nested screens that should highlight their parent tab. */
const TAB_PATH_ALIASES: Record<string, readonly string[]> = {
  "/suppression": ["/unsubscribe"],
  "/feedback": ["/complaints"],
}

/** Admin dropdown items (SD#12.3). Viewer never sees the menu. */
export const APP_ADMIN_NAV_ITEMS = [
  {
    title: "Offers",
    href: "/offers",
    documentTitle: "Offers",
    minRole: "operator",
  },
  {
    title: "Audit log",
    href: "/admin/audit-log",
    documentTitle: "Audit log",
    minRole: "operator",
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
  if (pathname === href || pathname.startsWith(`${href}/`)) {
    return true
  }
  const aliases = TAB_PATH_ALIASES[href] ?? []
  return aliases.some(
    (alias) => pathname === alias || pathname.startsWith(`${alias}/`)
  )
}

export function isAdminSectionActive(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/offers" ||
    pathname.startsWith("/offers/")
  )
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
