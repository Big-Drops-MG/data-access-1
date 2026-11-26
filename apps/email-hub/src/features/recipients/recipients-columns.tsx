"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import type { RecipientListItem } from "@/features/recipients/api"
import { shortRecipientId } from "@/features/recipients/labels"
import { RecipientMessageStatusBadge } from "@/features/recipients/recipient-message-status-badge"
import { RecipientStatusBadge } from "@/features/recipients/recipient-status-badge"
import { RecipientTierBadge } from "@/features/recipients/recipient-tier-badge"

function EmptyCell() {
  return <span className="text-[13px] text-fg-muted">—</span>
}

export const recipientsColumns: ColumnDef<RecipientListItem, unknown>[] = [
  {
    id: "recipient",
    accessorKey: "email",
    header: "Recipient",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p
          className="truncate text-[13px] font-medium text-fg"
          title={row.original.email}
        >
          {row.original.email}
        </p>
        <p
          className="truncate font-mono text-[12px] text-fg-muted"
          title={row.original.id}
        >
          {shortRecipientId(row.original.id)}
        </p>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <RecipientStatusBadge
        status={row.original.status}
        unsubscribed={row.original.unsubscribed}
      />
    ),
  },
  {
    id: "tier",
    accessorKey: "tier",
    header: "Tier",
    cell: ({ row }) => <RecipientTierBadge tier={row.original.tier} />,
  },
  {
    id: "offer",
    accessorFn: (row) => row.offer?.external_ref ?? null,
    header: "Offer",
    cell: ({ row }) =>
      row.original.offer ? (
        <span
          className="block truncate font-mono text-[13px] text-fg"
          title={row.original.offer.name}
        >
          {row.original.offer.external_ref}
        </span>
      ) : (
        <EmptyCell />
      ),
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
