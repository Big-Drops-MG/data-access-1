"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import type { UnsubscribeOptOut } from "@/features/unsubscribe-admin/api"

function scopeLabel(row: UnsubscribeOptOut): string {
  if (row.kind === "all") {
    return "All relationship"
  }
  return row.category_name ?? row.category_key ?? "Category"
}

export function optOutColumns(): ColumnDef<UnsubscribeOptOut, unknown>[] {
  return [
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
      id: "scope",
      accessorFn: (row) => scopeLabel(row),
      header: "Scope",
      cell: ({ row }) => (
        <span className="text-fg">{scopeLabel(row.original)}</span>
      ),
    },
    {
      id: "source",
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] text-fg-muted">
          {row.original.source}
        </span>
      ),
    },
    {
      id: "occurred_at",
      accessorKey: "occurred_at",
      header: "When",
      cell: ({ row }) => <EtDateTime value={row.original.occurred_at} />,
    },
  ]
}
