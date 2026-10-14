import { formatEtDateTime } from "@workspace/shared"
import { cn } from "@workspace/ui/lib/utils"

type EtDateTimeProps = {
  value: Date | string | number | null | undefined
  className?: string
  /** Shown when value is missing or invalid. */
  fallback?: string
}

/**
 * Display-only Eastern time (SD#12.7).
 * Always America/New_York as `MMM d, yyyy, h:mm a z`.
 */
export function EtDateTime({
  value,
  className,
  fallback = "—",
}: EtDateTimeProps) {
  if (value == null || value === "") {
    return (
      <time className={cn("text-body text-fg-muted", className)} dateTime="">
        {fallback}
      </time>
    )
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return (
      <time className={cn("text-body text-fg-muted", className)} dateTime="">
        {fallback}
      </time>
    )
  }

  return (
    <time
      className={cn("text-body text-fg tabular-nums", className)}
      dateTime={date.toISOString()}
      data-testid="et-datetime"
    >
      {formatEtDateTime(date)}
    </time>
  )
}
