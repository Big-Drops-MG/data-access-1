"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { AlertListItem } from "@/features/alerts/api"
import {
  alertSeverityLabel,
  alertSeverityVariant,
  alertStatusToBadge,
  alertTypeLabel,
  isAcknowledged,
  shortAlertId,
} from "@/features/alerts/alerts-status"

export function alertsColumns(
  currentUserId?: string | null
): ColumnDef<AlertListItem, unknown>[] {
  return [
    {
      id: "type",
      accessorKey: "type",
      header: "Alert",
      cell: ({ row }) => (
        <div className="min-w-0">
          <span
            className="block truncate font-medium text-fg capitalize"
            title={row.original.type}
          >
            {alertTypeLabel(row.original.type)}
          </span>
          <span
            className="block truncate font-mono text-[12px] text-fg-muted"
            title={row.original.id}
          >
            {shortAlertId(row.original.id)}
          </span>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: "severity",
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => (
        <StatusBadge variant={alertSeverityVariant(row.original.severity)}>
          {alertSeverityLabel(row.original.severity)}
        </StatusBadge>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={alertStatusToBadge(row.original.status)} />
      ),
    },
    {
      id: "occurrences",
      accessorKey: "occurrence_count",
      header: "Count",
      cell: ({ row }) => (
        <span className="text-fg tabular-nums">
          {row.original.occurrence_count}
        </span>
      ),
    },
    {
      id: "last_triggered",
      accessorKey: "last_triggered_at",
      header: "Last triggered (ET)",
      cell: ({ row }) => (
        <EtDateTime
          value={row.original.last_triggered_at}
          className="text-[13px] text-fg-muted"
        />
      ),
    },
    {
      id: "ack",
      accessorFn: (row) => row.acknowledged_at ?? "",
      header: "Ack",
      cell: ({ row }) => {
        const item = row.original
        if (!isAcknowledged(item)) {
          return <span className="text-fg-muted">—</span>
        }
        const isYou =
          currentUserId != null && item.acknowledged_by === currentUserId
        return (
          <div className="space-y-1">
            <StatusBadge status="acknowledged" />
            <span className="block text-[12px] text-fg-muted">
              {isYou ? "You" : "Acknowledged"}
            </span>
          </div>
        )
      },
    },
  ]
}
