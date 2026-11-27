"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { APP_PRIMARY_TABS, isPathActive } from "@/lib/app-nav"

/** Horizontal module tabs. */
export function AppTabs() {
  const pathname = usePathname()

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
      </ul>
    </nav>
  )
}
