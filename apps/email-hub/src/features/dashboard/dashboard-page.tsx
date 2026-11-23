"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import {
  StatusBadge,
  type StatusBadgeStatus,
} from "@/components/app/status-badge"
import type {
  DashboardKpis,
  DashboardQueueCounts,
  DashboardSummary,
} from "@/features/dashboard/api"
import { useDashboardSummary } from "@/features/dashboard/use-dashboard-summary"
import type { AlertJson } from "@/lib/alerts/serialize"
import { isApiError } from "@/lib/api-client"
import type { SendJson } from "@/lib/sends/serialize"

const numberFmt = new Intl.NumberFormat("en-US")

const KPI_LABELS: { key: keyof DashboardKpis; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "bounced", label: "Bounced" },
  { key: "complaints", label: "Complaints" },
]

function sectionLinkClassName() {
  return "text-sm font-medium text-link hover:underline"
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <p className="text-caption font-medium tracking-wide text-fg-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums">
        {numberFmt.format(value)}
      </p>
    </div>
  )
}

function SectionCard({
  title,
  description,
  action,
  children,
  testId,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-surface"
      data-testid={testId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description ? (
            <p className="text-[12px] text-fg-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function EmptySection({
  message,
  testId,
}: {
  message: string
  testId: string
}) {
  return (
    <p
      className="px-4 py-10 text-center text-sm text-fg-muted"
      data-testid={testId}
    >
      {message}
    </p>
  )
}

function QueueTable({ queues }: { queues: DashboardQueueCounts[] }) {
  if (queues.length === 0) {
    return (
      <EmptySection message="No queue data." testId="dashboard-queues-empty" />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead className="bg-surface-2 text-caption font-medium tracking-wide text-fg-muted uppercase">
          <tr>
            <th className="px-4 py-2.5 font-medium">Queue</th>
            <th className="px-4 py-2.5 font-medium">Waiting</th>
            <th className="px-4 py-2.5 font-medium">Active</th>
            <th className="px-4 py-2.5 font-medium">Failed</th>
            <th className="px-4 py-2.5 font-medium">Delayed</th>
          </tr>
        </thead>
        <tbody>
          {queues.map((row) => (
            <tr
              key={row.queue}
              className="border-t border-border"
              data-testid="dashboard-queue-row"
            >
              <th scope="row" className="px-4 py-2.5 font-medium text-fg">
                {row.queue}
              </th>
              <td className="px-4 py-2.5 text-fg tabular-nums">
                {numberFmt.format(row.waiting)}
              </td>
              <td className="px-4 py-2.5 text-fg tabular-nums">
                {numberFmt.format(row.active)}
              </td>
              <td className="px-4 py-2.5 text-fg tabular-nums">
                {numberFmt.format(row.failed)}
              </td>
              <td className="px-4 py-2.5 text-fg tabular-nums">
                {numberFmt.format(row.delayed)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function alertTypeLabel(type: string): string {
  return type.replaceAll("_", " ")
}

function alertSeverityLabel(severity: AlertJson["severity"]): string {
  if (severity === "critical") {
    return "Critical"
  }
  if (severity === "warning") {
    return "Warning"
  }
  return "Info"
}

function severityClass(severity: AlertJson["severity"]): string {
  if (severity === "critical") {
    return "text-err"
  }
  if (severity === "warning") {
    return "text-warn"
  }
  return "text-info"
}

function sendStatusBadge(status: SendJson["status"]): StatusBadgeStatus {
  return status
}

function OpenAlertsList({ alerts }: { alerts: AlertJson[] }) {
  if (alerts.length === 0) {
    return (
      <EmptySection message="No open alerts." testId="dashboard-alerts-empty" />
    )
  }

  return (
    <ul className="divide-y divide-border" data-testid="dashboard-alerts-list">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
          data-testid="dashboard-alert-row"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg capitalize">
              {alertTypeLabel(alert.type)}
            </p>
            <p
              className={`text-[12px] font-medium ${severityClass(alert.severity)}`}
            >
              {alertSeverityLabel(alert.severity)}
              {alert.occurrence_count > 1
                ? ` · ${numberFmt.format(alert.occurrence_count)} times`
                : ""}
            </p>
          </div>
          <EtDateTime
            value={alert.last_triggered_at}
            className="shrink-0 text-[13px] text-fg-muted"
          />
        </li>
      ))}
    </ul>
  )
}

function SendsList({
  sends,
  emptyMessage,
  emptyTestId,
  listTestId,
}: {
  sends: SendJson[]
  emptyMessage: string
  emptyTestId: string
  listTestId: string
}) {
  if (sends.length === 0) {
    return <EmptySection message={emptyMessage} testId={emptyTestId} />
  }

  return (
    <ul className="divide-y divide-border" data-testid={listTestId}>
      {sends.map((send) => (
        <li key={send.id} data-testid="dashboard-send-row">
          <Link
            href={`/sends/${send.id}`}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">
                {send.name}
              </p>
              <p className="truncate text-[12px] text-fg-muted">
                {send.offer_name ?? send.template_name ?? "Send"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <StatusBadge status={sendStatusBadge(send.status)} />
              <EtDateTime
                value={send.scheduled_for}
                className="text-[13px] text-fg-muted"
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function DashboardBody({ data }: { data: DashboardSummary }) {
  return (
    <>
      <section aria-labelledby="dashboard-kpis-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2
            id="dashboard-kpis-heading"
            className="text-sm font-semibold text-fg"
          >
            Today&apos;s KPIs
          </h2>
          <p className="text-[12px] text-fg-muted tabular-nums">
            Day {data.day} · Eastern Time
          </p>
        </div>
        <div
          className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          data-testid="dashboard-kpis"
        >
          {KPI_LABELS.map(({ key, label }) => (
            <KpiTile key={key} label={label} value={data.kpis[key]} />
          ))}
        </div>
      </section>

      <SectionCard
        title="Queues"
        description="Current BullMQ depths"
        testId="dashboard-queues"
      >
        <QueueTable queues={data.queues} />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Open alerts"
          description="Most recent open alerts"
          action={
            <Link href="/alerts" className={sectionLinkClassName()}>
              View all
            </Link>
          }
          testId="dashboard-alerts"
        >
          <OpenAlertsList alerts={data.open_alerts} />
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="Recent sends"
            description="Latest completed or active sends"
            action={
              <Link href="/sends" className={sectionLinkClassName()}>
                View all
              </Link>
            }
            testId="dashboard-recent-sends"
          >
            <SendsList
              sends={data.recent_sends}
              emptyMessage="No recent sends."
              emptyTestId="dashboard-recent-sends-empty"
              listTestId="dashboard-recent-sends-list"
            />
          </SectionCard>

          <SectionCard
            title="Upcoming sends"
            description="Next scheduled sends"
            action={
              <Link
                href="/sends?status=scheduled"
                className={sectionLinkClassName()}
              >
                View scheduled
              </Link>
            }
            testId="dashboard-upcoming-sends"
          >
            <SendsList
              sends={data.upcoming_sends}
              emptyMessage="No upcoming sends."
              emptyTestId="dashboard-upcoming-sends-empty"
              listTestId="dashboard-upcoming-sends-list"
            />
          </SectionCard>
        </div>
      </div>
    </>
  )
}

export function DashboardPage({
  emailRoutes = null,
}: {
  emailRoutes?: ReactNode
}) {
  const summary = useDashboardSummary()

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <PageHeader
        title="Dashboard"
        description="Today's sending KPIs, email routes, queue health, open alerts, and recent activity."
      />

      {emailRoutes}

      {summary.isError ? (
        <InlineErrorCard
          message={
            isApiError(summary.error)
              ? summary.error.message
              : "Could not load dashboard."
          }
          requestId={isApiError(summary.error) ? summary.error.requestId : null}
          onRetry={() => {
            void summary.refetch()
          }}
        />
      ) : null}

      {summary.isLoading ? (
        <div
          className="h-48 animate-pulse rounded-md bg-surface-2"
          data-testid="dashboard-loading"
          aria-hidden
        />
      ) : null}

      {summary.data ? <DashboardBody data={summary.data} /> : null}
    </div>
  )
}
