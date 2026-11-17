"use client"

import { useEffect, useState } from "react"

import { ET_TIME_ZONE, getEtAbbreviation } from "@workspace/shared/client"
import { cn } from "@workspace/ui/lib/utils"

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
})

function formatLiveEtClock(now: Date): string {
  return `${clockFormatter.format(now)} ${getEtAbbreviation(now)}`
}

type AppTopBarClockProps = {
  className?: string
}

/** Live America/New_York clock for the top bar. */
export function AppTopBarClock({ className }: AppTopBarClockProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setNow(new Date())
    }, 0)
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <time
      className={cn("text-caption text-fg-muted tabular-nums", className)}
      dateTime={now?.toISOString()}
      data-testid="app-top-bar-clock"
      suppressHydrationWarning
    >
      {now ? formatLiveEtClock(now) : "\u00a0"}
    </time>
  )
}
