"use client"

import { StatusBadge } from "@/components/app/status-badge"
import type { RecipientListItem } from "@/features/recipients/api"
import { recipientTierLabel } from "@/features/recipients/labels"

type RecipientTierBadgeProps = {
  tier: RecipientListItem["tier"]
  className?: string
}

export function RecipientTierBadge({
  tier,
  className,
}: RecipientTierBadgeProps) {
  return (
    <StatusBadge
      variant={tier === "premium" ? "info" : "neutral"}
      className={className}
    >
      {recipientTierLabel(tier)}
    </StatusBadge>
  )
}
