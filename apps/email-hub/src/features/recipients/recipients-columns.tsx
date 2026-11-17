"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { RecipientListItem } from "@/features/recipients/api"
import {
  recipientStatusLabel,
  recipientTierLabel,
  shortRecipientId,
} from "@/features/recipients/labels"

export const recipientsColumns: ColumnDef<RecipientListItem, unknown>[] = [
  {
    id: "recipient",
    accessorKey: "email",
    header: "Recipient",
    cell: ({ row }) => (
      <span className="block min-w-0 truncate">
        <span
          className="block truncate font-medium text-fg"
          title={row.original.email}
        >
          {row.original.email}
        </span>
        <span className="block truncate text-[12px] text-fg-muted">
          {shortRecipientId(row.original.id)}
        </span>
      </span>
    ),
    enableHiding: false,
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
    cell: ({ row }) => (
      <span className="inline-flex rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-fg">
        {recipientTierLabel(row.original.tier)}
      </span>
    ),
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
        <span className="text-[13px] text-fg-muted">—</span>
      ),
  },
]
