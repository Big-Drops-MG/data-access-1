"use client"

import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"

import {
  UNSUBSCRIBE_VIEWS,
  type UnsubscribeView,
} from "@/features/unsubscribe-admin/unsubscribe-view"

type UnsubscribeViewTabsProps = {
  value: UnsubscribeView
  onChange: (value: UnsubscribeView) => void
  className?: string
}

export function UnsubscribeViewTabs({
  value,
  onChange,
  className,
}: UnsubscribeViewTabsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="tablist"
      aria-label="Unsubscribe view"
      data-testid="unsubscribe-view-tabs"
    >
      {UNSUBSCRIBE_VIEWS.map((tab) => {
        const selected = value === tab.value
        return (
          <motion.button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.description}
            layout
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onChange(tab.value)}
            data-testid={`unsubscribe-view-tab-${tab.value}`}
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
