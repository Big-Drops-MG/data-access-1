"use client"

import { WifiOff } from "lucide-react"

import { useOnlineStatus } from "@/components/app/online-status"

/** Top banner when offline; mutations should use useCanMutate (SD#12.8). */
export function OfflineBanner() {
  const { isOnline } = useOnlineStatus()
  if (isOnline) {
    return null
  }

  return (
    <div
      className="flex items-center justify-center gap-2 border-b border-warn/40 bg-warn/15 px-4 py-2 text-sm font-medium text-fg"
      data-testid="offline-banner"
      role="status"
      aria-live="polite"
    >
      <WifiOff
        className="size-4 shrink-0 text-warn"
        strokeWidth={1.75}
        aria-hidden
      />
      <span>You are offline</span>
    </div>
  )
}
