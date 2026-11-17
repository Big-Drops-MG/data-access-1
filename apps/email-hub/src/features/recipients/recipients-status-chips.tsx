"use client"

import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"

export type RecipientStatusChipValue = "all" | "active" | "bounced"

const CHIPS: ReadonlyArray<{
  value: RecipientStatusChipValue
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "bounced", label: "Bounced" },
]

type RecipientsStatusChipsProps = {
  value: RecipientStatusChipValue
  onChange: (value: RecipientStatusChipValue) => void
  className?: string
}

export function RecipientsStatusChips({
  value,
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
              "relative inline-flex items-center rounded-full border px-3.5 py-1.5 text-[13px] leading-none font-medium tracking-tight outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
              selected
                ? "border-fg bg-fg text-bg shadow-sm"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            )}
          >
            {chip.label}
          </motion.button>
        )
      })}
    </div>
  )
}
