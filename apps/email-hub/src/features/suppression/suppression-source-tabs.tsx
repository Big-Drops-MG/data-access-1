"use client"

import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"

import {
  SUPPRESSION_SOURCE_TABS,
  type SuppressionSourceTabValue,
} from "@/features/suppression/suppression-source"

type SuppressionSourceTabsProps = {
  value: SuppressionSourceTabValue
  onChange: (value: SuppressionSourceTabValue) => void
  className?: string
}

export function SuppressionSourceTabs({
  value,
  onChange,
  className,
}: SuppressionSourceTabsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="group"
      aria-label="Filter by source"
      data-testid="suppression-source-chips"
    >
      {SUPPRESSION_SOURCE_TABS.map((tab) => {
        const selected = value === tab.value
        return (
          <motion.button
            key={tab.value}
            type="button"
            layout
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onChange(tab.value)}
            aria-pressed={selected}
            data-testid={`suppression-source-chip-${tab.value}`}
            className={cn(
              "relative inline-flex items-center rounded-full border px-3.5 py-1.5 text-[13px] leading-none font-medium tracking-tight outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
              selected
                ? "border-fg bg-fg text-bg shadow-sm"
                : "border-border bg-surface text-fg hover:bg-surface-2"
            )}
          >
            {tab.label}
          </motion.button>
        )
      })}
    </div>
  )
}
