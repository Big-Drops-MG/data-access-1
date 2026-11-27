import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { BrandMark } from "@/components/auth/brand-mark"
import { isDevEnvironmentBadgeVisible } from "@/lib/env-badge"
import type { AppRole } from "@/lib/permissions"

import { AppTopBarAlertBell } from "./app-top-bar-alert-bell"
import { AppTopBarClock } from "./app-top-bar-clock"
import { AppTopBarOfferSwitcher } from "./app-top-bar-offer-switcher"
import { AppTopBarUserMenu } from "./app-top-bar-user-menu"

type AppTopBarProps = {
  name: string
  jobTitle: string
  image: string | null
  role: AppRole
  openAlertCount?: number
  canViewAlerts?: boolean
  className?: string
}

/** Sticky app chrome: logo, env badge, clock, alert bell, user menu (SD#12.2). */
export function AppTopBar({
  name,
  jobTitle,
  image,
  role,
  openAlertCount = 0,
  canViewAlerts = false,
  className,
}: AppTopBarProps) {
  const showDevBadge = isDevEnvironmentBadgeVisible()

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-surface px-6",
        className
      )}
      data-testid="app-top-bar"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          className="shrink-0 rounded-sm outline-none"
          aria-label="EmailHub dashboard"
        >
          <BrandMark size="md" />
        </Link>
        {showDevBadge ? (
          <span
            className="rounded-sm bg-env-dev px-2 py-0.5 text-caption font-medium text-on-env-dev"
            data-testid="app-top-bar-env-badge"
          >
            DEV
          </span>
        ) : null}
      </div>

      <div className="mx-4 min-w-0 flex-1">
        <AppTopBarOfferSwitcher />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <AppTopBarClock />
        <AppTopBarAlertBell
          enabled={canViewAlerts}
          fallbackCount={openAlertCount}
        />
        <AppTopBarUserMenu
          name={name}
          jobTitle={jobTitle}
          image={image}
          role={role}
        />
      </div>
    </header>
  )
}
