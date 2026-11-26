"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BellIcon, CheckIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { EtDateTime } from "@/components/app/et-datetime"
import { useOptionalOfferSelection } from "@/components/app/offer-provider"
import {
  acknowledgeAlert,
  fetchAlertsList,
  type AlertListItem,
} from "@/features/alerts/api"
import {
  alertSeverityLabel,
  alertSeverityVariant,
  alertTypeLabel,
  isAcknowledged,
} from "@/features/alerts/alerts-status"
import { isApiError } from "@/lib/api-client"
import { listQueryKey } from "@/lib/query-keys"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

export const ALERT_BELL_POLL_INTERVAL_MS = 60_000

const SEVERITY_DOT_CLASS: Record<"info" | "warn" | "err", string> = {
  err: "bg-destructive",
  warn: "bg-warn",
  info: "bg-info",
}

const SEVERITY_PILL_CLASS: Record<"info" | "warn" | "err", string> = {
  err: "bg-destructive/10 text-destructive",
  warn: "bg-warn/15 text-warn",
  info: "bg-info/15 text-info",
}

type AppTopBarAlertBellProps = {
  enabled?: boolean
  fallbackCount?: number
}

export function AppTopBarAlertBell({
  enabled = false,
  fallbackCount = 0,
}: AppTopBarAlertBellProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const offerSelection = useOptionalOfferSelection()
  const selectedOfferId = offerSelection?.selectedOfferId ?? undefined

  const params = {
    status: "open" as const,
    limit: 20,
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

  const ackMutation = useMutation({
    mutationFn: (id: string) => acknowledgeAlert(id),
    onSuccess: () => {
      toast.success("Alert acknowledged.")
      void queryClient.invalidateQueries({ queryKey: listQueryKey("alerts") })
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not acknowledge alert."
      )
    },
  })

  const alerts: AlertListItem[] = enabled ? (query.data?.data ?? []) : []
  const openAlertCount = enabled
    ? (query.data?.data.length ?? fallbackCount)
    : fallbackCount

  const alertLabel =
    openAlertCount > 0
      ? `Notifications, ${openAlertCount} open`
      : "Notifications, no open alerts"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full border border-border text-fg-muted transition-colors outline-none",
          "hover:bg-muted/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
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
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 p-0"
        data-testid="app-top-bar-alerts-popover"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Notifications</h2>
            {openAlertCount > 0 ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted tabular-nums">
                {openAlertCount} open
              </span>
            ) : null}
          </div>
          <Link
            href="/alerts"
            className="text-xs font-medium text-link hover:underline"
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        </header>

        <div className="max-h-80 overflow-y-auto">
          {!enabled ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              No notifications available.
            </p>
          ) : query.isPending && !query.data ? (
            <div className="space-y-3 p-4" aria-hidden>
              <div className="h-12 animate-pulse rounded-md bg-surface-2" />
              <div className="h-12 animate-pulse rounded-md bg-surface-2" />
            </div>
          ) : query.isError ? (
            <div className="space-y-2 px-4 py-6 text-center">
              <p className="text-sm text-fg-muted">
                {isApiError(query.error)
                  ? query.error.message
                  : "Could not load notifications."}
              </p>
              <button
                type="button"
                className="text-xs font-medium text-link hover:underline"
                onClick={() => {
                  void query.refetch()
                }}
              >
                Retry
              </button>
            </div>
          ) : alerts.length === 0 ? (
            <p
              className="px-4 py-8 text-center text-sm text-fg-muted"
              data-testid="app-top-bar-alerts-empty"
            >
              All caught up. No open notifications.
            </p>
          ) : (
            <ul
              className="divide-y divide-border"
              aria-label="Open notifications"
            >
              {alerts.map((alert) => {
                const variant = alertSeverityVariant(alert.severity)
                const acked = isAcknowledged(alert)
                const ackingThis =
                  ackMutation.isPending && ackMutation.variables === alert.id

                return (
                  <li
                    key={alert.id}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
                    data-testid="app-top-bar-alert-item"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        SEVERITY_DOT_CLASS[variant]
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
                            SEVERITY_PILL_CLASS[variant]
                          )}
                        >
                          {alertSeverityLabel(alert.severity)}
                        </span>
                        <EtDateTime
                          value={alert.created_at}
                          className="shrink-0 text-[11px] text-fg-muted"
                        />
                      </div>
                      <p className="text-[13px] font-medium text-fg capitalize">
                        {alertTypeLabel(alert.type)}
                      </p>
                      <p className="text-xs text-fg-muted tabular-nums">
                        Triggered {alert.occurrence_count}{" "}
                        {alert.occurrence_count === 1 ? "time" : "times"}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        {acked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                            <CheckIcon className="size-3" aria-hidden />
                            Acknowledged
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="text-xs font-medium text-link hover:underline disabled:opacity-50"
                            disabled={ackingThis}
                            onClick={() => ackMutation.mutate(alert.id)}
                          >
                            {ackingThis ? "Acknowledging…" : "Acknowledge"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-border px-4 py-2.5 text-center">
          <Link
            href="/alerts"
            className="text-xs font-medium text-fg-muted hover:text-fg"
            onClick={() => setOpen(false)}
          >
            Open Alerts page
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  )
}
