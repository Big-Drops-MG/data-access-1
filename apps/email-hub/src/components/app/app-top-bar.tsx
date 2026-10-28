import Link from "next/link"
import { BellIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { BrandMark } from "@/components/auth/brand-mark"
import { isDevEnvironmentBadgeVisible } from "@/lib/env-badge"

import { AppTopBarClock } from "./app-top-bar-clock"
import { AppTopBarUserMenu } from "./app-top-bar-user-menu"

type AppTopBarProps = {
  name: string
  jobTitle: string
  image: string | null
  /** Open alert count; placeholder until alerts API (T-034). */
  openAlertCount?: number
  className?: string
}

/** Sticky app chrome: logo, env badge, clock, alert bell, user menu (SD#12.2). */
export function AppTopBar({
  name,
  jobTitle,
  image,
  openAlertCount = 0,
  className,
}: AppTopBarProps) {
  const showDevBadge = isDevEnvironmentBadgeVisible()
  const alertLabel =
    openAlertCount > 0
      ? `Alerts, ${openAlertCount} open`
      : "Alerts, no open alerts"

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

      <div className="ml-auto flex items-center gap-4">
        <AppTopBarClock />
        <Link
          href="/alerts"
          className={cn(
            "relative flex size-9 items-center justify-center rounded-full border border-border text-fg-muted outline-none",
            "hover:bg-muted/60 hover:text-fg"
          )}
          aria-label={alertLabel}
          data-testid="app-top-bar-alerts"
        >
          <BellIcon className="size-4" aria-hidden />
          {openAlertCount > 0 ? (
            <span
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
              data-testid="app-top-bar-alert-count"
            >
              {openAlertCount > 99 ? "99+" : openAlertCount}
            </span>
          ) : null}
        </Link>
        <AppTopBarUserMenu name={name} jobTitle={jobTitle} image={image} />
      </div>
    </header>
  )
}
