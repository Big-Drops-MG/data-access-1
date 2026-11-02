"use client"

import { useEffect, useState } from "react"

import { ET_TIME_ZONE, getEtAbbreviation } from "@workspace/shared"
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
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <time
      className={cn("text-caption text-fg-muted tabular-nums", className)}
      dateTime={now.toISOString()}
      data-testid="app-top-bar-clock"
    >
      {formatLiveEtClock(now)}
    </time>
  )
}
