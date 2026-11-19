"use client"

import { motion } from "motion/react"

import type { RecipientStatusCounts } from "@/features/recipients/api"
import { cn } from "@workspace/ui/lib/utils"

export type RecipientStatusChipValue =
  "all" | "active" | "bounced" | "unsubscribed"

const CHIPS: ReadonlyArray<{
  value: RecipientStatusChipValue
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "bounced", label: "Bounced" },
  { value: "unsubscribed", label: "Unsubscribed" },
]

const numberFmt = new Intl.NumberFormat("en-US")

type RecipientsStatusChipsProps = {
  value: RecipientStatusChipValue
  counts: RecipientStatusCounts
  onChange: (value: RecipientStatusChipValue) => void
  className?: string
}

export function RecipientsStatusChips({
  value,
  counts,
  onChange,
  className,
}: RecipientsStatusChipsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="group"
      aria-label="Filter by status"
      data-testid="recipients-status-chips"
    >
      {CHIPS.map((chip) => {
        const selected = value === chip.value
        const count = Number(counts[chip.value] ?? 0)
        return (
          <motion.button
            key={chip.value}
            type="button"
            layout
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onChange(chip.value)}
            aria-pressed={selected}
            data-testid={`recipients-status-chip-${chip.value}`}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-3.5 text-[13px] leading-none font-medium tracking-tight outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
              selected
                ? "border-fg bg-fg text-bg shadow-sm"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            )}
          >
            <span>{chip.label}</span>
            <span
              className={cn(
                "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums",
                selected
                  ? "bg-bg text-fg"
                  : "border border-border bg-surface-2 text-fg"
              )}
              data-testid={`recipients-status-chip-${chip.value}-count`}
            >
              {numberFmt.format(count)}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
