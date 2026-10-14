import { Loader2 } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

export const statusBadgeVariants = {
  neutral: "text-fg-muted",
  info: "text-info",
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  brand: "text-fg",
} as const

export type StatusBadgeVariant = keyof typeof statusBadgeVariants

/** SD#12.9 status values and colours (text always shown with the badge). */
export const statusBadgeCatalog = {
  queued: { variant: "neutral", label: "Queued" },
  sent: { variant: "ok", label: "Sent" },
  skipped: { variant: "warn", label: "Skipped" },
  failed: { variant: "err", label: "Failed" },
  draft: { variant: "neutral", label: "Draft" },
  scheduled: { variant: "info", label: "Scheduled" },
  dispatching: { variant: "info", label: "Dispatching", spinner: true },
  completed: { variant: "ok", label: "Completed" },
  cancelled: { variant: "neutral", label: "Cancelled" },
  active: { variant: "ok", label: "Active" },
  pending: { variant: "warn", label: "Pending" },
  degraded: { variant: "warn", label: "Degraded" },
  disabled: { variant: "neutral", label: "Disabled" },
  archived: { variant: "neutral", label: "Archived" },
  open: { variant: "err", label: "Open" },
  acknowledged: { variant: "neutral", label: "Acknowledged" },
  in_review: { variant: "info", label: "In review" },
  decided: { variant: "ok", label: "Decided" },
} as const satisfies Record<
  string,
  { variant: StatusBadgeVariant; label: string; spinner?: boolean }
>

export type StatusBadgeStatus = keyof typeof statusBadgeCatalog

type StatusBadgeBaseProps = {
  className?: string
}

type StatusBadgeByStatus = StatusBadgeBaseProps & {
  status: StatusBadgeStatus
  variant?: never
  children?: never
}

type StatusBadgeByVariant = StatusBadgeBaseProps & {
  status?: never
  variant: StatusBadgeVariant
  children: React.ReactNode
  spinner?: boolean
}

export type StatusBadgeProps = StatusBadgeByStatus | StatusBadgeByVariant

export function StatusBadge(props: StatusBadgeProps) {
  const className = props.className
  const resolved =
    "status" in props && props.status
      ? statusBadgeCatalog[props.status]
      : {
          variant: props.variant,
          label: props.children,
          spinner: props.spinner ?? false,
        }

  return (
    <span
      className={cn(
        "status-badge inline-flex h-[22px] items-center gap-1.5 rounded-sm border px-2 text-caption font-medium whitespace-nowrap",
        statusBadgeVariants[resolved.variant],
        className
      )}
      data-testid="status-badge"
    >
      {"spinner" in resolved && resolved.spinner ? (
        <Loader2
          className="size-3 animate-spin"
          strokeWidth={1.75}
          aria-hidden
        />
      ) : (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      )}
      <span>{resolved.label}</span>
    </span>
  )
}
