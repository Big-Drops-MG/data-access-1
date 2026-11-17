"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import type { AuditLogListItem } from "@/features/audit-log/api"
import { actorTypeLabel, objectTypeLabel } from "@/features/audit-log/labels"
import {
  auditEventSummary,
  payloadDisplayName,
} from "@/features/audit-log/summary"

export const auditLogColumns: ColumnDef<AuditLogListItem, unknown>[] = [
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "When",
    cell: ({ row }) => (
      <EtDateTime
        value={row.original.created_at}
        className="text-[13px] text-fg-muted"
      />
    ),
    enableHiding: false,
  },
  {
    id: "event",
    accessorFn: (row) => auditEventSummary(row),
    header: "Event",
    cell: ({ row }) => (
      <span
        className="block min-w-0 truncate font-medium text-fg"
        title={auditEventSummary(row.original)}
      >
        {auditEventSummary(row.original)}
      </span>
    ),
  },
  {
    id: "actor",
    accessorFn: (row) => row.actor_name,
    header: "Actor",
    cell: ({ row }) => {
      const typeLabel = actorTypeLabel(row.original.actor_type)
      return (
        <span
          className="block min-w-0 truncate text-fg"
          title={`${row.original.actor_name} · ${typeLabel}`}
        >
          <span className="font-medium">{row.original.actor_name}</span>
          <span className="ml-1.5 text-[12px] text-fg-muted">{typeLabel}</span>
        </span>
      )
    },
  },
  {
    id: "object",
    accessorFn: (row) => {
      const label =
        payloadDisplayName(row.after) ??
        payloadDisplayName(row.before) ??
        objectTypeLabel(row.object_type)
      return `${objectTypeLabel(row.object_type)} ${label}`
    },
    header: "Object",
    cell: ({ row }) => {
      const type = objectTypeLabel(row.original.object_type)
      const label =
        payloadDisplayName(row.original.after) ??
        payloadDisplayName(row.original.before)
      const title = label ? `${type} · ${label}` : type
      return (
        <span className="block min-w-0 truncate text-fg" title={title}>
          <span className="font-medium">{type}</span>
          {label ? (
            <span className="ml-1.5 text-[12px] text-fg-muted">{label}</span>
          ) : null}
        </span>
      )
    },
  },
]
