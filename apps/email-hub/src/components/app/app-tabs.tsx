"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import {
  APP_PRIMARY_TABS,
  canSeeAdminNav,
  isAdminSectionActive,
  isPathActive,
  visibleAdminNavItems,
} from "@/lib/app-nav"
import type { AppRole } from "@/lib/permissions"

type AppTabsProps = {
  role: AppRole
}

/** Horizontal module tabs + Admin dropdown (SD#12.3 / T-044). */
export function AppTabs({ role }: AppTabsProps) {
  const pathname = usePathname()
  const [adminOpen, setAdminOpen] = useState(false)
  const showAdmin = canSeeAdminNav(role)
  const adminItems = visibleAdminNavItems(role)
  const adminActive = isAdminSectionActive(pathname)

  return (
    <nav
      className="sticky top-14 z-10 border-b border-border bg-surface px-6"
      aria-label="Main"
      data-testid="app-tab-bar"
    >
      <ul className="flex h-11 list-none items-stretch gap-1 p-0">
        {APP_PRIMARY_TABS.map((tab) => {
          const active = isPathActive(pathname, tab.href)
          return (
            <li key={tab.href} className="flex">
              <Link
                href={tab.href}
                className={cn(
                  "inline-flex items-center border-b-2 px-3 text-sm transition-colors outline-none",
                  active
                    ? "border-accent font-semibold text-fg"
                    : "border-transparent font-medium text-fg-muted hover:text-fg"
                )}
                aria-current={active ? "page" : undefined}
                data-testid={`app-tab-${tab.href.slice(1)}`}
              >
                {tab.title}
              </Link>
            </li>
          )
        })}

        {showAdmin && adminItems.length > 0 ? (
          <li className="flex">
            <Popover open={adminOpen} onOpenChange={setAdminOpen}>
              <PopoverTrigger
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 border-b-2 px-3 text-sm transition-colors outline-none",
                  adminActive
                    ? "border-accent font-semibold text-fg"
                    : "border-transparent font-medium text-fg-muted hover:text-fg"
                )}
                aria-haspopup="menu"
                aria-expanded={adminOpen}
                data-testid="app-tab-admin"
              >
                Admin
                <ChevronDownIcon className="size-4" aria-hidden />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={4}
                className="w-48 gap-0.5 border border-border bg-surface-2 p-1 shadow-md dark:border-border-strong dark:shadow-[0_12px_40px_rgb(0_0_0_/_0.55)] dark:ring-1 dark:ring-white/12"
                data-testid="app-tab-admin-menu"
              >
                <ul className="m-0 list-none p-0" role="menu">
                  {adminItems.map((item) => {
                    const active = isPathActive(pathname, item.href)
                    return (
                      <li key={item.href} role="none">
                        <Link
                          href={item.href}
                          role="menuitem"
                          className={cn(
                            "flex rounded-md px-3 py-2 text-sm transition-colors outline-none",
                            active
                              ? "bg-accent/10 font-medium text-fg"
                              : "text-fg hover:bg-surface"
                          )}
                          aria-current={active ? "page" : undefined}
                          data-testid={`app-tab-admin-${item.href.split("/").pop()}`}
                          onClick={() => setAdminOpen(false)}
                        >
                          {item.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
