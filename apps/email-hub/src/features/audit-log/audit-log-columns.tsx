"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import type { AuditLogListItem } from "@/features/audit-log/api"

function shortId(value: string | null): string {
  if (!value) {
    return "—"
  }
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

export const auditLogColumns: ColumnDef<AuditLogListItem, unknown>[] = [
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "When (ET)",
    cell: ({ row }) => (
      <EtDateTime
        value={row.original.created_at}
        className="text-[13px] text-fg-muted"
      />
    ),
    enableHiding: false,
  },
  {
    id: "actor",
    accessorFn: (row) => `${row.actor_type}:${row.actor_id ?? ""}`,
    header: "Actor",
    cell: ({ row }) => (
      <span
        className="block truncate text-fg"
        title={row.original.actor_id ?? undefined}
      >
        <span className="font-medium">{row.original.actor_type}</span>
        {row.original.actor_id ? (
          <span className="ml-1 font-mono text-[12px] text-fg-muted">
            {shortId(row.original.actor_id)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: "action",
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => (
      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg">
        {row.original.action}
      </code>
    ),
  },
  {
    id: "object",
    accessorFn: (row) => `${row.object_type}:${row.object_id ?? ""}`,
    header: "Object",
    cell: ({ row }) => (
      <span
        className="block truncate text-fg"
        title={
          row.original.object_id
            ? `${row.original.object_type} · ${row.original.object_id}`
            : row.original.object_type
        }
      >
        <span className="font-medium">{row.original.object_type}</span>
        {row.original.object_id ? (
          <span className="ml-1 font-mono text-[12px] text-fg-muted">
            {shortId(row.original.object_id)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: "request_id",
    accessorKey: "request_id",
    header: "Request",
    cell: ({ row }) => (
      <span
        className="block truncate font-mono text-[12px] text-fg-muted"
        title={row.original.request_id ?? undefined}
      >
        {shortId(row.original.request_id)}
      </span>
    ),
  },
]
