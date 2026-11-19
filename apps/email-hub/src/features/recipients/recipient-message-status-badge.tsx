"use client"

import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/app/status-badge"
import { messageStatusLabel } from "@/features/recipients/labels"
import type { RecipientMessageJson } from "@/lib/recipients/serialize"

type RecipientMessageStatusBadgeProps = {
  status: RecipientMessageJson["status"]
}

const MESSAGE_STATUS_VARIANT: Record<
  RecipientMessageJson["status"],
  StatusBadgeVariant
> = {
  queued: "neutral",
  sending: "info",
  sent: "ok",
  delivered: "ok",
  bounced: "err",
  complained: "err",
  skipped: "warn",
  failed: "err",
}

export function RecipientMessageStatusBadge({
  status,
}: RecipientMessageStatusBadgeProps) {
  return (
    <StatusBadge variant={MESSAGE_STATUS_VARIANT[status]}>
      {messageStatusLabel(status)}
    </StatusBadge>
  )
}
