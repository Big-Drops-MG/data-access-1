"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { SuppressionListItem } from "@/features/suppression/api"
import {
  suppressionSourceLabel,
  suppressionSourceVariant,
} from "@/features/suppression/suppression-source"

export type SuppressionRow = SuppressionListItem & {
  offer_label: string
  added_by_label: string
}

function scopeLabel(row: SuppressionRow): string {
  if (row.scope === "offer") {
    return row.offer_label
  }
  if (row.scope === "list_unsub") {
    return "List unsubscribe"
  }
  return "Global"
}

export const suppressionColumns: ColumnDef<SuppressionRow, unknown>[] = [
  {
    id: "email",
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span
        className="block truncate font-mono text-[13px] text-fg"
        title={row.original.email ?? undefined}
      >
        {row.original.email ?? "—"}
      </span>
    ),
    enableHiding: false,
  },
  {
    id: "source",
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => (
      <StatusBadge variant={suppressionSourceVariant(row.original.source)}>
        {suppressionSourceLabel(row.original.source)}
      </StatusBadge>
    ),
  },
  {
    id: "scope",
    accessorFn: (row) => scopeLabel(row),
    header: "Scope",
    cell: ({ row }) => {
      const label = scopeLabel(row.original)
      return (
        <span className="block truncate text-fg" title={label}>
          {label}
        </span>
      )
    },
  },
  {
    id: "reason",
    accessorKey: "reason",
    header: "Reason",
    cell: ({ row }) => (
      <span
        className="block truncate text-fg-muted"
        title={row.original.reason ?? undefined}
      >
        {row.original.reason ?? "—"}
      </span>
    ),
  },
  {
    id: "added_by",
    accessorKey: "added_by_label",
    header: "Added by",
    cell: ({ row }) => (
      <span className="block truncate text-fg-muted">
        {row.original.added_by_label}
      </span>
    ),
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Added (ET)",
    cell: ({ row }) => (
      <EtDateTime
        value={row.original.created_at}
        className="text-[13px] text-fg-muted"
      />
    ),
  },
]
