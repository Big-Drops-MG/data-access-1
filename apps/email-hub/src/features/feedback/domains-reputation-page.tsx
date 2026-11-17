"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"

import { formatEtDate } from "@workspace/shared/client"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { apiJson, isApiError } from "@/lib/api-client"
import type { DataTablePageSize } from "@/lib/data-table/page-size"

type ProviderMetricRow = {
  provider: string
  target: string
  metric: string
  day: string
  value: number
}

type ProviderMetricsResponse = {
  name: string
  from: string
  to: string
  data: ProviderMetricRow[]
}

export type DomainReputationRow = {
  id: string
  provider: string
  domain: string
  day: string
  spam_rate: number | null
  domain_reputation: number | null
  ip_reputation: number | null
  complaint_rate: number | null
  junk_reports: number | null
}

const REPUTATION_LABELS: Record<number, string> = {
  4: "High",
  3: "Medium",
  2: "Low",
  1: "Bad",
}

function etDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000)
  return formatEtDate(d) || d.toISOString().slice(0, 10)
}

function providerLabel(provider: string): string {
  switch (provider) {
    case "google_postmaster":
      return "Google Postmaster"
    case "snds":
      return "Microsoft SNDS"
    case "yahoo":
      return "Yahoo"
    case "jmrp":
      return "Microsoft JMRP"
    default:
      return provider
  }
}

function formatRate(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "—"
  }
  return `${(value * 100).toFixed(2)}%`
}

function formatReputation(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "—"
  }
  const rounded = Math.round(value)
  return REPUTATION_LABELS[rounded] ?? value.toFixed(2)
}

function pivotDomainMetrics(rows: ProviderMetricRow[]): DomainReputationRow[] {
  const latest = new Map<
    string,
    {
      provider: string
      domain: string
      day: string
      metrics: Record<string, number>
    }
  >()

  for (const row of rows) {
    const key = `${row.provider}\0${row.target}`
    const existing = latest.get(key)
    if (!existing || row.day > existing.day) {
      latest.set(key, {
        provider: row.provider,
        domain: row.target,
        day: row.day,
        metrics: { [row.metric]: row.value },
      })
      continue
    }
    if (row.day === existing.day) {
      existing.metrics[row.metric] = row.value
    }
  }

  return [...latest.values()]
    .map((entry) => ({
      id: `${entry.provider}:${entry.domain}`,
      provider: entry.provider,
      domain: entry.domain,
      day: entry.day,
      spam_rate: entry.metrics.spam_rate ?? null,
      domain_reputation: entry.metrics.domain_reputation ?? null,
      ip_reputation: entry.metrics.ip_reputation ?? null,
      complaint_rate: entry.metrics.complaint_rate ?? null,
      junk_reports: entry.metrics.junk_reports ?? null,
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain))
}

/** Local preview rows when ClickHouse has nothing yet. */
export const DEMO_PROVIDER_METRICS: ProviderMetricRow[] = [
  {
    provider: "google_postmaster",
    target: "mail.example.com",
    metric: "spam_rate",
    day: "2026-11-17",
    value: 0.012,
  },
  {
    provider: "google_postmaster",
    target: "mail.example.com",
    metric: "domain_reputation",
    day: "2026-11-17",
    value: 4,
  },
  {
    provider: "google_postmaster",
    target: "mail.example.com",
    metric: "ip_reputation",
    day: "2026-11-17",
    value: 3,
  },
  {
    provider: "google_postmaster",
    target: "news.bigdrops.io",
    metric: "spam_rate",
    day: "2026-11-17",
    value: 0.048,
  },
  {
    provider: "google_postmaster",
    target: "news.bigdrops.io",
    metric: "domain_reputation",
    day: "2026-11-17",
    value: 2,
  },
  {
    provider: "google_postmaster",
    target: "news.bigdrops.io",
    metric: "ip_reputation",
    day: "2026-11-17",
    value: 2,
  },
  {
    provider: "google_postmaster",
    target: "203.0.113.10/32",
    metric: "ip_reputation",
    day: "2026-11-17",
    value: 3,
  },
  {
    provider: "snds",
    target: "mail.example.com",
    metric: "complaint_rate",
    day: "2026-11-17",
    value: 0.0015,
  },
  {
    provider: "yahoo",
    target: "mail.example.com",
    metric: "complaint_rate",
    day: "2026-11-17",
    value: 0.0022,
  },
]

function fetchProviderMetrics(
  from: string,
  to: string
): Promise<ProviderMetricsResponse> {
  const params = new URLSearchParams({ from, to, include_machine: "false" })
  return apiJson<ProviderMetricsResponse>(
    `/api/reports/provider-metrics?${params.toString()}`
  )
}

const columns: ColumnDef<DomainReputationRow, unknown>[] = [
  {
    id: "domain",
    accessorKey: "domain",
    header: "Domain / target",
    cell: ({ row }) => (
      <span className="font-mono text-[13px] text-fg">
        {row.original.domain}
      </span>
    ),
  },
  {
    id: "provider",
    accessorFn: (row) => providerLabel(row.provider),
    header: "Provider",
    cell: ({ row }) => (
      <span className="text-fg">{providerLabel(row.original.provider)}</span>
    ),
  },
  {
    id: "day",
    accessorKey: "day",
    header: "As of (ET)",
    cell: ({ row }) => (
      <span className="text-[13px] text-fg-muted tabular-nums">
        {row.original.day}
      </span>
    ),
  },
  {
    id: "spam_rate",
    accessorKey: "spam_rate",
    header: "Spam rate",
    cell: ({ row }) => (
      <span className="text-[13px] text-fg tabular-nums">
        {formatRate(row.original.spam_rate)}
      </span>
    ),
  },
  {
    id: "domain_reputation",
    accessorKey: "domain_reputation",
    header: "Domain reputation",
    cell: ({ row }) => (
      <span className="text-fg">
        {formatReputation(row.original.domain_reputation)}
      </span>
    ),
  },
  {
    id: "ip_reputation",
    accessorKey: "ip_reputation",
    header: "IP reputation",
    cell: ({ row }) => (
      <span className="text-fg">
        {formatReputation(row.original.ip_reputation)}
      </span>
    ),
  },
  {
    id: "complaint_rate",
    accessorKey: "complaint_rate",
    header: "Complaint rate",
    cell: ({ row }) => (
      <span className="text-[13px] text-fg tabular-nums">
        {formatRate(row.original.complaint_rate)}
      </span>
    ),
  },
  {
    id: "junk_reports",
    accessorKey: "junk_reports",
    header: "Junk reports",
    cell: ({ row }) => (
      <span className="text-[13px] text-fg tabular-nums">
        {row.original.junk_reports == null
          ? "—"
          : String(row.original.junk_reports)}
      </span>
    ),
  },
]

export function DomainsReputationPage() {
  const [pageSize, setPageSize] = useState<DataTablePageSize>(50)
  const to = formatEtDate(new Date()) || new Date().toISOString().slice(0, 10)
  const from = etDaysAgo(29)

  const query = useQuery({
    queryKey: ["reports", "provider-metrics", from, to],
    queryFn: () => fetchProviderMetrics(from, to),
  })

  const liveRows = useMemo(
    () => pivotDomainMetrics(query.data?.data ?? []),
    [query.data?.data]
  )
  const useDemo =
    process.env.NEXT_PUBLIC_DEMO_DOMAIN_METRICS === "1" &&
    !query.isPending &&
    (query.isError || liveRows.length === 0)
  const rows = useMemo(
    () => (useDemo ? pivotDomainMetrics(DEMO_PROVIDER_METRICS) : liveRows),
    [liveRows, useDemo]
  )

  return (
    <div className="space-y-4" data-testid="complaints-domains-panel">
      <p className="text-[14px] text-fg-muted">
        Aggregate domain and IP health: Google Postmaster, Microsoft SNDS, and
        Yahoo / Microsoft junk rates from Hub FBL intake. These are not per-user
        complaint rows.
      </p>

      {useDemo ? (
        <aside
          className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-[14px] text-fg"
          data-testid="complaints-domains-demo-banner"
          role="status"
        >
          Showing demo domain reputation rows so you can preview the Domains
          layout. Real Postmaster / SNDS / Yahoo metrics replace these once
          synced.
        </aside>
      ) : null}

      {query.isError && !useDemo ? (
        <InlineErrorCard
          message={
            isApiError(query.error)
              ? query.error.message
              : "Could not load domain reputation metrics."
          }
          requestId={isApiError(query.error) ? query.error.requestId : null}
          onRetry={() => {
            void query.refetch()
          }}
        />
      ) : null}

      {!query.isPending &&
      !query.isError &&
      liveRows.length === 0 &&
      !useDemo ? (
        <aside
          className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[14px] text-fg-muted"
          data-testid="complaints-domains-empty"
          role="status"
        >
          No domain reputation metrics yet. Google Postmaster sync runs daily
          when credentials are configured; Microsoft SNDS and Yahoo rates use
          the same table when those pulls are enabled.
        </aside>
      ) : null}

      <DataTable
        storageKey="complaints-domains"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        nextCursor={null}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onNextPage={() => undefined}
        onPreviousPage={() => undefined}
        canPreviousPage={false}
        isLoading={query.isPending && !query.data}
        showColumnToggle={false}
        equalColumnWidths
        animateRows
        emptyState={
          <span className="text-fg-muted">No domain metrics in range.</span>
        }
      />
    </div>
  )
}

export { pivotDomainMetrics, providerLabel, formatReputation, formatRate }
