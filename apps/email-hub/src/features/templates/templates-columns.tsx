"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { TemplateListItem } from "@/features/templates/api"
import { templateCategoryLabel } from "@/features/templates/email-type"
import {
  templatePublishLabel,
  templateStatusToBadge,
} from "@/features/templates/template-status"

export const templatesColumns: ColumnDef<TemplateListItem, unknown>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Template",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span
          className="block truncate font-medium text-fg"
          title={row.original.name}
        >
          {row.original.name}
        </span>
        <span
          className="block truncate font-mono text-[12px] text-fg-muted"
          title={row.original.id}
        >
          {row.original.id}
        </span>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "email_type",
    accessorKey: "email_type",
    header: "Email type",
    cell: ({ row }) => (
      <span className="inline-flex rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-fg">
        {row.original.email_type}
      </span>
    ),
  },
  {
    id: "category",
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => (
      <span className="text-fg-muted">
        {templateCategoryLabel(
          row.original.email_type,
          row.original.category_name
        )}
      </span>
    ),
  },
  {
    id: "current_version_no",
    accessorKey: "current_version_no",
    header: "Current",
    cell: ({ row }) => (
      <span className="text-fg tabular-nums">
        {row.original.current_version_no != null
          ? `v${row.original.current_version_no}`
          : "—"}
      </span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const badge = templateStatusToBadge(row.original)
      const label = templatePublishLabel(row.original)
      if (badge === "active" && label === "Published") {
        return <StatusBadge variant="ok">{label}</StatusBadge>
      }
      return <StatusBadge status={badge} />
    },
  },
  {
    id: "updated_at",
    accessorKey: "updated_at",
    header: "Updated (ET)",
    cell: ({ row }) => (
      <EtDateTime
        value={row.original.updated_at}
        className="text-[13px] text-fg-muted"
      />
    ),
  },
]
