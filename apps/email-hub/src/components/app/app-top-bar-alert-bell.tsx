"use client"

import { useQuery } from "@tanstack/react-query"
import { BellIcon } from "lucide-react"
import Link from "next/link"

import { useOptionalOfferSelection } from "@/components/app/offer-provider"
import { fetchAlertsList } from "@/features/alerts/api"
import { listQueryKey } from "@/lib/query-keys"
import { cn } from "@workspace/ui/lib/utils"

export const ALERT_BELL_POLL_INTERVAL_MS = 60_000

type AppTopBarAlertBellProps = {
  enabled?: boolean
  fallbackCount?: number
}

export function AppTopBarAlertBell({
  enabled = false,
  fallbackCount = 0,
}: AppTopBarAlertBellProps) {
  const offerSelection = useOptionalOfferSelection()
  const selectedOfferId = offerSelection?.selectedOfferId ?? undefined

  const params = {
    status: "open" as const,
    limit: 100,
    offer_id: selectedOfferId,
  }

  const query = useQuery({
    queryKey: listQueryKey("alerts", params),
    queryFn: () => fetchAlertsList(params),
    enabled,
    refetchInterval: ALERT_BELL_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  })

  const openAlertCount = enabled
    ? (query.data?.data.length ?? fallbackCount)
    : fallbackCount

  const alertLabel =
    openAlertCount > 0
      ? `Alerts, ${openAlertCount} open`
      : "Alerts, no open alerts"

  return (
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
  )
}
