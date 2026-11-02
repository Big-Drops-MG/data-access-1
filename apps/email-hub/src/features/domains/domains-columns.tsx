"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { DomainListItem } from "@/features/domains/api"
import { DnsCheckBadge } from "@/features/domains/dns-status"
import { domainStatusToBadge } from "@/features/domains/domain-status"
import type { DnsCheckGroup } from "@/lib/domains/dns-rollup"

function dnsColumn(
  group: DnsCheckGroup,
  header: string
): ColumnDef<DomainListItem, unknown> {
  return {
    id: group,
    header,
    cell: ({ row }) => (
      <DnsCheckBadge state={row.original.dns_summary[group]} />
    ),
  }
}

export const domainsColumns: ColumnDef<DomainListItem, unknown>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Domain",
    cell: ({ row }) => (
      <Link
        href={`/domains/${row.original.id}`}
        className="block truncate font-medium text-fg hover:underline"
        title={row.original.name}
      >
        {row.original.name}
      </Link>
    ),
    enableHiding: false,
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
  dnsColumn("spf", "SPF"),
  dnsColumn("dkim", "DKIM"),
  dnsColumn("dmarc", "DMARC"),
  dnsColumn("mail_from", "MAIL FROM"),
  {
    id: "sender_count",
    accessorKey: "sender_count",
    header: "Senders",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.sender_count}</span>
    ),
  },
  {
    id: "last_checked_at",
    accessorKey: "last_checked_at",
    header: "Last checked",
    cell: ({ row }) => <EtDateTime value={row.original.last_checked_at} />,
  },
]
