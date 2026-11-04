"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { StatusBadge } from "@/components/app/status-badge"
import type { SenderListItem } from "@/features/senders/api"
import {
  senderStatusLabel,
  senderStatusToBadge,
} from "@/features/senders/sender-status"

export const sendersColumns: ColumnDef<SenderListItem, unknown>[] = [
  {
    id: "from_name",
    accessorKey: "from_name",
    header: "From name",
    cell: ({ row }) => (
      <span
        className="block truncate font-medium text-fg"
        title={row.original.from_name}
      >
        {row.original.from_name}
      </span>
    ),
    enableHiding: false,
  },
  {
    id: "from_email",
    accessorKey: "from_email",
    header: "Address",
    cell: ({ row }) => (
      <span
        className="block truncate font-mono text-[13px] text-fg-muted"
        title={row.original.from_email}
      >
        {row.original.from_email}
      </span>
    ),
  },
  {
    id: "reply_to",
    accessorKey: "reply_to",
    header: "Reply-to",
    cell: ({ row }) => (
      <span
        className="block truncate font-mono text-[13px] text-fg-muted"
        title={row.original.reply_to ?? undefined}
      >
        {row.original.reply_to ?? "—"}
      </span>
    ),
  },
  {
    id: "active_route_count",
    accessorKey: "active_route_count",
    header: "Used by routes",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.active_route_count}</span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const badgeStatus = senderStatusToBadge(row.original.status)
      if (badgeStatus) {
        return <StatusBadge status={badgeStatus} />
      }
      return (
        <StatusBadge variant="neutral">
          {senderStatusLabel(row.original.status)}
        </StatusBadge>
      )
    },
  },
]
