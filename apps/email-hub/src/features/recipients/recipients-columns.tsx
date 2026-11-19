"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { RecipientListItem } from "@/features/recipients/api"
import {
  recipientStatusLabel,
  shortRecipientId,
} from "@/features/recipients/labels"
import { RecipientMessageStatusBadge } from "@/features/recipients/recipient-message-status-badge"
import { RecipientTierBadge } from "@/features/recipients/recipient-tier-badge"

function EmptyCell() {
  return <span className="text-[13px] text-fg-muted">—</span>
}

export const recipientsColumns: ColumnDef<RecipientListItem, unknown>[] = [
  {
    id: "id",
    accessorKey: "id",
    header: "Recipient ID",
    cell: ({ row }) => (
      <span
        className="block truncate font-mono text-[13px] text-fg"
        title={row.original.id}
      >
        {shortRecipientId(row.original.id)}
      </span>
    ),
    enableHiding: false,
  },
  {
    id: "email",
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span
        className="block min-w-0 truncate font-medium text-fg"
        title={row.original.email}
      >
        {row.original.email}
      </span>
    ),
    enableHiding: false,
  },
  {
    id: "first_name",
    accessorKey: "first_name",
    header: "First name",
    cell: ({ row }) =>
      row.original.first_name ? (
        <span className="block truncate text-[13px] text-fg">
          {row.original.first_name}
        </span>
      ) : (
        <EmptyCell />
      ),
  },
  {
    id: "last_name",
    accessorKey: "last_name",
    header: "Last name",
    cell: ({ row }) =>
      row.original.last_name ? (
        <span className="block truncate text-[13px] text-fg">
          {row.original.last_name}
        </span>
      ) : (
        <EmptyCell />
      ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.status === "active" ? (
        <StatusBadge status="active" />
      ) : (
        <StatusBadge variant="err">
          {recipientStatusLabel(row.original.status)}
        </StatusBadge>
      ),
  },
  {
    id: "tier",
    accessorKey: "tier",
    header: "Tier",
    cell: ({ row }) => <RecipientTierBadge tier={row.original.tier} />,
  },
  {
    id: "last_message",
    accessorFn: (row) => row.last_message?.status ?? null,
    header: "Last message",
    cell: ({ row }) => {
      const last = row.original.last_message
      if (!last) {
        return <EmptyCell />
      }
      return <RecipientMessageStatusBadge status={last.status} />
    },
  },
  {
    id: "last_emailed_at",
    accessorKey: "last_emailed_at",
    header: "Last activity (ET)",
    cell: ({ row }) =>
      row.original.last_emailed_at ? (
        <EtDateTime
          value={row.original.last_emailed_at}
          className="text-[13px] text-fg-muted"
        />
      ) : (
        <EmptyCell />
      ),
  },
]
