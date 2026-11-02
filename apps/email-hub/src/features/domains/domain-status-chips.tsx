"use client"

import { motion } from "motion/react"

import type { DomainStatusCounts } from "@/features/domains/api"
import { cn } from "@workspace/ui/lib/utils"

export type DomainStatusChipValue =
  "all" | "verified" | "pending" | "verifying" | "failed" | "inactive"

const CHIPS: ReadonlyArray<{
  value: DomainStatusChipValue
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "verified", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "verifying", label: "Verifying" },
  { value: "failed", label: "Degraded" },
  { value: "inactive", label: "Disabled" },
]

type DomainStatusChipsProps = {
  value: DomainStatusChipValue
  counts: DomainStatusCounts
  onChange: (value: DomainStatusChipValue) => void
  className?: string
}

/** Status filter chips with totals (Domains list toolbar). */
export function DomainStatusChips({
  value,
  counts,
  onChange,
  className,
}: DomainStatusChipsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="group"
      aria-label="Filter by status"
      data-testid="domains-status-chips"
    >
      {CHIPS.map((chip) => {
        const selected = value === chip.value
        const count = counts[chip.value]
        return (
          <motion.button
            key={chip.value}
            type="button"
            layout
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onChange(chip.value)}
            aria-pressed={selected}
            data-testid={`domains-status-chip-${chip.value}`}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-1.5 pl-3.5 text-[13px] leading-none font-medium tracking-tight outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
              selected
                ? "border-fg bg-fg text-bg shadow-sm"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            )}
          >
            <span className="py-0.5">{chip.label}</span>
            <motion.span
              key={count}
              initial={{ opacity: 0.4, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-medium tabular-nums",
                selected ? "bg-bg/20 text-bg" : "bg-surface-2 text-fg-muted"
              )}
            >
              {count}
            </motion.span>
          </motion.button>
        )
      })}
    </div>
  )
}
