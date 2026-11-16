"use client"

import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"

import {
  FEEDBACK_STATUS_TABS,
  type FeedbackStatusTabValue,
} from "@/features/feedback/feedback-status"

type FeedbackStatusTabsProps = {
  value: FeedbackStatusTabValue
  counts: Partial<Record<FeedbackStatusTabValue, number>>
  onChange: (value: FeedbackStatusTabValue) => void
  className?: string
}

export function FeedbackStatusTabs({
  value,
  counts,
  onChange,
  className,
}: FeedbackStatusTabsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="tablist"
      aria-label="Filter by status"
      data-testid="feedback-status-tabs"
    >
      {FEEDBACK_STATUS_TABS.map((chip) => {
        const selected = value === chip.value
        const count = counts[chip.value] ?? 0
        return (
          <motion.button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={selected}
            layout
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onChange(chip.value)}
            data-testid={`feedback-status-tab-${chip.value}`}
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
