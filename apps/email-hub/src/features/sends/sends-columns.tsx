"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { SendListItem } from "@/features/sends/api"
import {
  sendOfferLabel,
  sendProgressLabel,
  sendStatusToBadge,
  shortSendId,
} from "@/features/sends/send-status"

export const sendsColumns: ColumnDef<SendListItem, unknown>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Send",
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
          {shortSendId(row.original.id)}
        </span>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "template",
    accessorKey: "template_name",
    header: "Template",
    cell: ({ row }) => (
      <span
        className="block truncate text-fg-muted"
        title={row.original.template_name ?? undefined}
      >
        {row.original.template_name ?? "—"}
        {row.original.template_version_no != null
          ? ` · v${row.original.template_version_no}`
          : ""}
      </span>
    ),
  },
  {
    id: "offer",
    accessorKey: "offer_name",
    header: "Offer",
    cell: ({ row }) => (
      <span className="inline-flex max-w-full rounded-sm border border-border bg-surface-2 px-2 py-0.5 text-[12px] text-fg">
        <span className="truncate">{sendOfferLabel(row.original)}</span>
      </span>
    ),
  },
  {
    id: "scheduled_for",
    accessorKey: "scheduled_for",
    header: "Scheduled (ET)",
    cell: ({ row }) => (
      <EtDateTime
        value={row.original.scheduled_for}
        className="text-[13px] text-fg-muted"
      />
    ),
  },
  {
    id: "recipients",
    accessorFn: (row) => row.counts.total,
    header: "Recipients",
    cell: ({ row }) => (
      <span className="text-fg tabular-nums">
        {row.original.counts.total > 0
          ? row.original.counts.total.toLocaleString("en-US")
          : "—"}
      </span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge status={sendStatusToBadge(row.original.status)} />
    ),
  },
  {
    id: "progress",
    accessorFn: (row) => row.counts.processed,
    header: "Progress",
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-fg-muted tabular-nums">
        {sendProgressLabel(row.original)}
      </span>
    ),
  },
]
