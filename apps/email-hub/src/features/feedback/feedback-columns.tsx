"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { FeedbackListItem } from "@/features/feedback/api"
import {
  feedbackDecisionLabel,
  feedbackSourceLabel,
  feedbackStatusToBadge,
  feedbackTypeLabel,
  formatWaiting,
  isStalePending,
  shortFeedbackId,
  waitingMs,
} from "@/features/feedback/feedback-status"

export function feedbackColumns(
  currentUserId?: string | null
): ColumnDef<FeedbackListItem, unknown>[] {
  return [
    {
      id: "id",
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] text-fg" title={row.original.id}>
          {shortFeedbackId(row.original.id)}
        </span>
      ),
      enableHiding: false,
    },
    {
      id: "source",
      accessorFn: (row) => feedbackSourceLabel(row),
      header: "Source",
      cell: ({ row }) => (
        <span
          className="block truncate text-fg"
          title={feedbackSourceLabel(row.original)}
        >
          {feedbackSourceLabel(row.original)}
        </span>
      ),
    },
    {
      id: "type",
      accessorFn: (row) => feedbackTypeLabel(row),
      header: "Type",
      cell: ({ row }) => (
        <span className="text-fg-muted">{feedbackTypeLabel(row.original)}</span>
      ),
    },
    {
      id: "recipient",
      accessorKey: "email",
      header: "Recipient",
      cell: ({ row }) => (
        <span
          className="block truncate font-mono text-[13px] text-fg"
          title={row.original.email ?? undefined}
        >
          {row.original.email ?? "—"}
        </span>
      ),
    },
    {
      id: "received",
      accessorKey: "created_at",
      header: "Received (ET)",
      cell: ({ row }) => (
        <EtDateTime
          value={row.original.created_at}
          className="text-[13px] text-fg-muted"
        />
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const item = row.original
        const isYou =
          item.status === "in_review" &&
          currentUserId &&
          item.reviewing_by === currentUserId
        return (
          <div className="space-y-1">
            <StatusBadge status={feedbackStatusToBadge(item.status)} />
            {item.status === "resolved" ? (
              <span className="block text-[12px] text-fg-muted">
                {feedbackDecisionLabel(item.decision)}
              </span>
            ) : null}
            {item.status === "in_review" ? (
              <span className="block text-[12px] text-fg-muted">
                {isYou ? "You" : "Claimed"}
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "waiting",
      accessorFn: (row) => waitingMs(row),
      header: "Waiting",
      cell: ({ row }) => {
        const ms = waitingMs(row.original)
        const stale = isStalePending(row.original)
        return (
          <span
            className={
              stale
                ? "text-[13px] font-medium text-err tabular-nums"
                : "text-[13px] text-fg-muted tabular-nums"
            }
          >
            {row.original.status === "resolved" ? "—" : formatWaiting(ms)}
          </span>
        )
      },
    },
  ]
}
