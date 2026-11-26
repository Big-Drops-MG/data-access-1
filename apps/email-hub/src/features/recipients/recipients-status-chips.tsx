"use client"

import { motion } from "motion/react"

import type { RecipientStatusCounts } from "@/features/recipients/api"
import { cn } from "@workspace/ui/lib/utils"

export type RecipientStatusChipValue =
  "all" | "active" | "bounced" | "unsubscribed"

const CHIPS: ReadonlyArray<{
  value: RecipientStatusChipValue
  label: string
  countClassName: string
}> = [
  { value: "all", label: "All", countClassName: "text-fg" },
  { value: "active", label: "Active", countClassName: "text-ok" },
  { value: "bounced", label: "Bounced", countClassName: "text-err" },
  {
    value: "unsubscribed",
    label: "Unsubscribed",
    countClassName: "text-fg-muted",
  },
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
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] leading-none font-medium tracking-tight outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
              selected
                ? "border-fg bg-fg text-bg shadow-sm"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            )}
          >
            <span>{chip.label}</span>
            <span
              className={cn(
                "tabular-nums",
                selected ? "text-bg" : chip.countClassName
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
