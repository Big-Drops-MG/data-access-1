"use client"

import { cn } from "@workspace/ui/lib/utils"

export type SenderStatusTabValue = "active" | "inactive"

const TABS: ReadonlyArray<{ value: SenderStatusTabValue; label: string }> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Disabled" },
]

type SenderStatusTabsProps = {
  value: SenderStatusTabValue
  onChange: (value: SenderStatusTabValue) => void
  className?: string
}

/** Active / Disabled filter tabs for the Senders list. */
export function SenderStatusTabs({
  value,
  onChange,
  className,
}: SenderStatusTabsProps) {
  return (
    <div
      className={cn("flex items-end gap-4", className)}
      role="tablist"
      aria-label="Filter by status"
      data-testid="senders-status-tabs"
    >
      {TABS.map((tab) => {
        const selected = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`senders-status-tab-${tab.value}`}
            onClick={() => onChange(tab.value)}
            className={cn(
              "border-b-2 px-0.5 pb-2 text-sm tracking-tight transition-colors outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
              selected
                ? "border-fg font-semibold text-fg"
                : "border-transparent font-medium text-fg-muted hover:text-fg"
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
