"use client"

import { StatusBadge } from "@/components/app/status-badge"
import type { RecipientListItem } from "@/features/recipients/api"
import {
  recipientDisplayStatus,
  recipientStatusLabel,
} from "@/features/recipients/labels"

type RecipientStatusBadgeProps = {
  status: RecipientListItem["status"]
  unsubscribed?: boolean
}

export function RecipientStatusBadge({
  status,
  unsubscribed,
}: RecipientStatusBadgeProps) {
  const display = recipientDisplayStatus({ status, unsubscribed })
  if (display === "active") {
    return <StatusBadge status="active" />
  }
  if (display === "unsubscribed") {
    return (
      <StatusBadge variant="neutral">
        {recipientStatusLabel(display)}
      </StatusBadge>
    )
  }
  return (
    <StatusBadge variant="err">{recipientStatusLabel(display)}</StatusBadge>
  )
}
