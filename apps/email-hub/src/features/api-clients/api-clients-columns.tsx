"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { ApiClientListItem } from "@/features/api-clients/api"

export type ApiClientRow = ApiClientListItem

function statusVariant(status: ApiClientRow["status"]) {
  return status === "active" ? "ok" : "neutral"
}

function statusLabel(status: ApiClientRow["status"]) {
  return status === "active" ? "Active" : "Disabled"
}

export const apiClientsColumns: ColumnDef<ApiClientRow, unknown>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span
        className="block truncate font-medium text-fg"
        title={row.original.name}
      >
        {row.original.name}
      </span>
    ),
    enableHiding: false,
  },
  {
    id: "key_prefix",
    accessorKey: "key_prefix",
    header: "Key id",
    cell: ({ row }) => (
      <span
        className="block truncate font-mono text-[13px] text-fg"
        title={row.original.id}
      >
        {row.original.key_prefix}
        {"…"}
      </span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge variant={statusVariant(row.original.status)}>
        {statusLabel(row.original.status)}
      </StatusBadge>
    ),
  },
  {
    id: "scopes",
    accessorFn: (row) => row.scopes.join(", "),
    header: "Scopes",
    cell: ({ row }) => {
      const label =
        row.original.scopes.length > 0 ? row.original.scopes.join(", ") : "None"
      return (
        <span
          className="block truncate font-mono text-[12px] text-fg"
          title={label}
        >
          {label}
        </span>
      )
    },
  },
  {
    id: "ip_allowlist",
    accessorFn: (row) =>
      row.ip_allowlist.length > 0 ? row.ip_allowlist.join(", ") : "Any IP",
    header: "IP allowlist",
    cell: ({ row }) => {
      const label =
        row.original.ip_allowlist.length > 0
          ? row.original.ip_allowlist.join(", ")
          : "Any IP"
      return (
        <span className="block truncate text-fg-muted" title={label}>
          {label}
        </span>
      )
    },
  },
  {
    id: "last_used_at",
    accessorKey: "last_used_at",
    header: "Last used (ET)",
    cell: ({ row }) =>
      row.original.last_used_at ? (
        <EtDateTime
          value={row.original.last_used_at}
          className="text-[13px] text-fg-muted"
        />
      ) : (
        <span className="text-[13px] text-fg-muted">Never</span>
      ),
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Created (ET)",
    cell: ({ row }) => (
      <EtDateTime
        value={row.original.created_at}
        className="text-[13px] text-fg-muted"
      />
    ),
  },
]
