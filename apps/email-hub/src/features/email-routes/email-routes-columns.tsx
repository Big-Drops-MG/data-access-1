"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { StatusBadge } from "@/components/app/status-badge"
import type { EmailRouteListItem } from "@/features/email-routes/api"
import { emailRouteStatusToBadge } from "@/features/email-routes/email-route-status"

export type EmailRouteRow = EmailRouteListItem & {
  template_label: string
  sender_label: string
  offer_label: string
}

export const emailRoutesColumns: ColumnDef<EmailRouteRow, unknown>[] = [
  {
    id: "email_type",
    accessorKey: "email_type",
    header: "Email type",
    cell: ({ row }) => (
      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg">
        {row.original.email_type}
      </code>
    ),
    enableHiding: false,
  },
  {
    id: "offer",
    accessorKey: "offer_label",
    header: "Offer",
    cell: ({ row }) => {
      if (!row.original.offer_id) {
        return <span className="text-fg-muted">—</span>
      }
      return (
        <span
          className="block truncate font-medium text-fg"
          title={row.original.offer_label}
        >
          {row.original.offer_label}
        </span>
      )
    },
  },
  {
    id: "template",
    accessorKey: "template_label",
    header: "Template",
    cell: ({ row }) => (
      <span
        className="block truncate text-fg"
        title={row.original.template_label}
      >
        {row.original.template_label}
      </span>
    ),
  },
  {
    id: "sender",
    accessorKey: "sender_label",
    header: "Sender",
    cell: ({ row }) => (
      <span
        className="block truncate font-mono text-[13px] text-fg-muted"
        title={row.original.sender_label}
      >
        {row.original.sender_label}
      </span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge status={emailRouteStatusToBadge(row.original.status)} />
    ),
  },
]
