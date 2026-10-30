"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { StatusBadge } from "@/components/app/status-badge"
import { EtDateTime } from "@/components/app/et-datetime"
import { domainStatusToBadge } from "@/features/domains/domain-status"
import type { DomainListItem } from "@/features/domains/api"

export const domainsColumns: ColumnDef<DomainListItem, unknown>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Domain",
    cell: ({ row }) => (
      <span className="font-medium text-fg">{row.original.name}</span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const badgeStatus = domainStatusToBadge(row.original.status)
      if (badgeStatus) {
        return <StatusBadge status={badgeStatus} />
      }
      return <StatusBadge variant="neutral">{row.original.status}</StatusBadge>
    },
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) =>
      row.original.created_at ? (
        <EtDateTime value={row.original.created_at} />
      ) : (
        <span className="text-fg-muted">—</span>
      ),
    enableHiding: true,
  },
]
