/** Tab modules and browser titles (SD#12.3). */
export const APP_MODULE_PAGES = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "Reports", href: "/reports" },
  { title: "Sends", href: "/sends" },
  { title: "Templates", href: "/templates" },
  { title: "Routes", href: "/email-routes" },
  { title: "Senders", href: "/senders" },
  { title: "Domains", href: "/domains" },
  { title: "Recipients", href: "/recipients" },
  { title: "Suppression", href: "/suppression" },
  { title: "Feedback", href: "/feedback" },
  { title: "Alerts", href: "/alerts" },
] as const

export type AppModulePage = (typeof APP_MODULE_PAGES)[number]
