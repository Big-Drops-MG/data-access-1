"use client"

import type { ReactNode } from "react"
import { Send } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { getEtAbbreviation } from "@workspace/shared/client"
import { cn } from "@workspace/ui/lib/utils"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import {
  fetchDashboardReport,
  type DashboardSummary,
} from "@/features/dashboard/api"
import {
  BOUNCE_PAUSE_PERCENT,
  BOUNCE_WARN_PERCENT,
  CLICK_TARGET_PERCENT,
  CLICK_WATCH_PERCENT,
  COMPLAINT_PAUSE_PERCENT,
  COMPLAINT_WARN_PERCENT,
  OPEN_TARGET_PERCENT,
  OPEN_WATCH_PERCENT,
  UNSUBSCRIBE_PAUSE_PERCENT,
  UNSUBSCRIBE_WATCH_PERCENT,
  alertHeadline,
  buildIntegrationItems,
  chartAxis,
  dashboardSends,
  formatAxis,
  formatRate,
  limitTone,
  meterFill,
  normalizeEngagementRows,
  normalizeSendingRows,
  reportWindow,
  sentPerDay,
  summarizeRange,
  targetTone,
  type MeterTone,
  type ScheduleFilter,
  type SentDay,
} from "@/features/dashboard/model"
import { useDashboardSummary } from "@/features/dashboard/use-dashboard-summary"
import type { AlertJson } from "@/lib/alerts/serialize"
import { isApiError } from "@/lib/api-client"
import { listQueryOptions } from "@/lib/query-options"
import type { SendJson } from "@/lib/sends/serialize"

const numberFmt = new Intl.NumberFormat("en-US")

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const

const selectClass =
  "h-9 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]"

const meterBar: Record<MeterTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  neutral: "bg-fg-subtle",
}

function formatCount(value: number): string {
  return numberFmt.format(value)
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "—"
  }
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
  return `${formatted} ${getEtAbbreviation(date)}`
}

function Panel({
  title,
  action,
  children,
  testId,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-testid={testId}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

type KpiId = "sent" | "delivered" | "bounced" | "complaints" | "alerts"

function KpiCard({
  label,
  value,
  selected,
  pending = false,
  onSelect,
}: {
  label: string
  value: string
  selected: boolean
  pending?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border px-4 py-3 text-left transition-colors duration-300 ease-out outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
        selected
          ? "border-primary bg-primary text-on-primary"
          : "border-border bg-surface text-fg hover:bg-surface-2"
      )}
    >
      <p
        className={cn(
          "text-caption font-medium tracking-wide uppercase transition-colors duration-300",
          selected ? "text-on-primary/70" : "text-fg-muted"
        )}
      >
        {label}
      </p>
      {pending ? (
        <span
          className={cn(
            "mt-2 block h-8 w-16 animate-pulse rounded",
            selected ? "bg-on-primary/20" : "bg-surface-2"
          )}
          aria-hidden
        />
      ) : (
        <p className="mt-1 text-[28px] leading-8 font-semibold tracking-tight tabular-nums">
          {value}
        </p>
      )}
    </button>
  )
}

function RateMeter({
  label,
  value,
  fill,
  tone,
  markers,
  description,
}: {
  label: string
  value: string
  fill: number
  tone: MeterTone
  markers: string
  description: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm text-fg">{label}</h3>
        <p className="text-sm font-semibold text-fg tabular-nums">{value}</p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${label} ${value}`}
      >
        <div
          className={cn("h-1.5 rounded-full", meterBar[tone])}
          style={{ width: `${fill}%` }}
        />
      </div>
      <p className="mt-1.5 text-caption text-fg-muted">{markers}</p>
      <p className="text-caption text-fg-subtle">{description}</p>
    </div>
  )
}

function SentChart({
  days,
  rangeLabel,
  pending,
  error,
  onRetry,
}: {
  days: SentDay[]
  rangeLabel: string
  pending: boolean
  error: unknown
  onRetry: () => void
}) {
  const axis = chartAxis(Math.max(0, ...days.map((day) => day.sent)))
  return (
    <Panel
      title="Sent per day"
      testId="dashboard-sent-chart"
      action={<p className="text-caption text-fg-muted">{rangeLabel}</p>}
    >
      {error ? (
        <InlineErrorCard
          message={
            isApiError(error) ? error.message : "Could not load sent volume."
          }
          requestId={isApiError(error) ? error.requestId : null}
          onRetry={onRetry}
        />
      ) : null}
      {pending ? (
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          aria-hidden
        />
      ) : error ? null : (
        <figure>
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2">
            <div
              className="flex h-40 flex-col justify-between text-right text-caption text-fg-subtle tabular-nums"
              aria-hidden
            >
              <span>{formatAxis(axis.max)}</span>
              <span>{formatAxis(axis.mid)}</span>
              <span>0</span>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(days.length, 1) * 40 }}>
                <ul className="flex h-40 items-end gap-2 border-b border-border">
                  {days.map((day) => (
                    <li
                      key={day.day}
                      className="flex h-full min-w-0 flex-1 items-end justify-center"
                    >
                      <span
                        className="block w-full max-w-8 rounded-t bg-accent"
                        style={{
                          height:
                            day.sent <= 0
                              ? "0%"
                              : `${Math.max(4, (day.sent / axis.max) * 100)}%`,
                        }}
                        role="img"
                        aria-label={`${day.label}: ${formatCount(day.sent)} sent`}
                      />
                    </li>
                  ))}
                </ul>
                <ul className="mt-2 flex gap-2" aria-hidden>
                  {days.map((day) => (
                    <li
                      key={day.day}
                      className="min-w-0 flex-1 text-center text-caption text-fg-muted"
                    >
                      {day.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </figure>
      )}
    </Panel>
  )
}

function OpenAlerts({ alerts }: { alerts: AlertJson[] }) {
  return (
    <Panel
      title="Open alerts"
      testId="dashboard-alerts"
      action={
        <Link
          href="/alerts"
          className="text-sm font-medium text-link hover:underline"
        >
          View all
        </Link>
      }
    >
      {alerts.length === 0 ? (
        <p
          className="py-6 text-center text-sm text-fg-muted"
          data-testid="dashboard-alerts-empty"
        >
          No open alerts.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="dashboard-alerts-list">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex gap-3"
              data-testid="dashboard-alert-row"
            >
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full bg-err"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">
                  {alertHeadline(alert)}
                </p>
                <p className="text-caption text-fg-muted">
                  {formatWhen(alert.last_triggered_at)}
                  <span aria-hidden> · </span>
                  <span className="font-mono">{alert.type}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const sendColumns =
  "grid w-full grid-cols-[minmax(0,1fr)_7.5rem_11rem_7.5rem] items-center gap-x-8"

function SendsTable({ sends }: { sends: SendJson[] }) {
  return (
    <section
      className="rounded-xl border border-border bg-surface"
      data-testid="dashboard-sends"
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <h2 className="text-sm font-semibold text-fg">Sends</h2>
        <Link href="/sends" className="text-sm text-fg-muted hover:text-fg">
          All sends
        </Link>
      </header>
      <div className="px-4 pt-3 pb-4">
        <div className="overflow-x-auto">
          <table className="block w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Recent and upcoming sends</caption>
            <thead className="block w-full">
              <tr
                className={cn(
                  sendColumns,
                  "pb-3 text-[11px] font-medium tracking-wide text-fg-muted uppercase"
                )}
              >
                <th scope="col" className="text-left font-medium">
                  Send
                </th>
                <th scope="col" className="text-left font-medium">
                  Status
                </th>
                <th
                  scope="col"
                  className="text-left font-medium whitespace-nowrap"
                >
                  Scheduled (ET)
                </th>
                <th scope="col" className="text-right font-medium">
                  Recipients
                </th>
              </tr>
            </thead>
            {sends.length > 0 ? (
              <tbody className="block w-full">
                {sends.map((send) => (
                  <tr
                    key={send.id}
                    className={cn(sendColumns, "border-t border-border")}
                    data-testid="dashboard-send-row"
                  >
                    <th scope="row" className="py-3 font-medium text-fg">
                      <Link
                        href={`/sends/${send.id}`}
                        className="hover:underline"
                      >
                        {send.name}
                      </Link>
                    </th>
                    <td className="py-3 whitespace-nowrap">
                      <StatusBadge status={send.status} />
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      <EtDateTime
                        value={send.completed_at ?? send.scheduled_for}
                        className="text-[13px] text-fg-muted"
                      />
                    </td>
                    <td className="py-3 text-right whitespace-nowrap text-fg tabular-nums">
                      {formatCount(send.counts.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
        </div>
        {sends.length === 0 ? (
          <div
            className="flex flex-col items-center rounded-lg bg-surface-2 px-6 py-10 text-center"
            data-testid="dashboard-sends-empty"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Send aria-hidden className="size-4" strokeWidth={1.75} />
            </div>
            <p className="mt-3 text-sm font-semibold text-fg">No sends yet</p>
            <p className="mt-1 max-w-sm text-sm text-fg-muted">
              Create your first campaign to start sending. Drafts, scheduled
              sends, and completed sends will appear here.
            </p>
            <Link
              href="/sends/new"
              className="mt-4 inline-flex h-8 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-on-primary hover:bg-accent/90"
              data-testid="dashboard-create-campaign"
            >
              Create first campaign
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function DashboardBody({
  data,
  rangeDays,
  schedule,
}: {
  data: DashboardSummary
  rangeDays: (typeof RANGES)[number]["days"]
  schedule: ScheduleFilter
}) {
  const range = useMemo(() => reportWindow(rangeDays), [rangeDays])
  const rangeLabel =
    RANGES.find((item) => item.days === rangeDays)?.label ?? "Last 7 days"
  const [selectedKpi, setSelectedKpi] = useState<KpiId>("alerts")
  const sendingQuery = useQuery(
    listQueryOptions(
      "reports",
      () => fetchDashboardReport("sending", { from: range.from, to: range.to }),
      ["sending", range.from, range.to]
    )
  )
  const engagementQuery = useQuery(
    listQueryOptions(
      "reports",
      () =>
        fetchDashboardReport("engagement", {
          from: range.from,
          to: range.to,
        }),
      ["engagement", range.from, range.to, false]
    )
  )

  const sendingRows = useMemo(
    () => normalizeSendingRows(sendingQuery.data?.data ?? []),
    [sendingQuery.data]
  )
  const summary = useMemo(
    () =>
      summarizeRange(
        sendingQuery.data ? sendingRows : [],
        engagementQuery.data
          ? normalizeEngagementRows(engagementQuery.data.data)
          : null
      ),
    [engagementQuery.data, sendingQuery.data, sendingRows]
  )
  const days = useMemo(
    () =>
      sentPerDay(range.from, range.to, sendingQuery.data ? sendingRows : []),
    [range.from, range.to, sendingQuery.data, sendingRows]
  )
  const sends = useMemo(
    () => dashboardSends(data.recent_sends, data.upcoming_sends, schedule),
    [data.recent_sends, data.upcoming_sends, schedule]
  )
  const integrations = useMemo(
    () =>
      buildIntegrationItems({
        integrations: data.integrations ?? [],
        alerts: data.open_alerts,
        analytics: sendingQuery.isError
          ? "error"
          : sendingQuery.isSuccess
            ? "ok"
            : "pending",
        formatWhen,
      }),
    [
      data.integrations,
      data.open_alerts,
      sendingQuery.isError,
      sendingQuery.isSuccess,
    ]
  )

  const volumeReady = sendingQuery.isSuccess
  const volumeValue = (value: number) =>
    volumeReady ? formatCount(value) : "—"

  return (
    <>
      <div
        className="grid grid-cols-2 gap-3 xl:grid-cols-5"
        data-testid="dashboard-kpis"
      >
        <KpiCard
          label="Sent"
          value={volumeValue(summary.sent)}
          pending={sendingQuery.isPending}
          selected={selectedKpi === "sent"}
          onSelect={() => setSelectedKpi("sent")}
        />
        <KpiCard
          label="Delivered"
          value={volumeValue(summary.delivered)}
          pending={sendingQuery.isPending}
          selected={selectedKpi === "delivered"}
          onSelect={() => setSelectedKpi("delivered")}
        />
        <KpiCard
          label="Bounced"
          value={volumeValue(summary.bounced)}
          pending={sendingQuery.isPending}
          selected={selectedKpi === "bounced"}
          onSelect={() => setSelectedKpi("bounced")}
        />
        <KpiCard
          label="Complaints"
          value={volumeValue(summary.complaints)}
          pending={sendingQuery.isPending}
          selected={selectedKpi === "complaints"}
          onSelect={() => setSelectedKpi("complaints")}
        />
        <KpiCard
          label="Open alerts"
          value={formatCount(data.open_alert_count ?? data.open_alerts.length)}
          selected={selectedKpi === "alerts"}
          onSelect={() => setSelectedKpi("alerts")}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4">
          <SentChart
            days={days}
            rangeLabel={rangeLabel}
            pending={sendingQuery.isPending}
            error={sendingQuery.error}
            onRetry={() => {
              void sendingQuery.refetch()
            }}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Sending reputation" testId="dashboard-reputation">
              <div className="space-y-4">
                <RateMeter
                  label="Bounce rate"
                  value={formatRate(summary.bounceRate)}
                  fill={meterFill(summary.bounceRate, BOUNCE_PAUSE_PERCENT)}
                  tone={limitTone(
                    summary.bounceRate,
                    BOUNCE_WARN_PERCENT,
                    BOUNCE_PAUSE_PERCENT
                  )}
                  markers={`Warn at ${BOUNCE_WARN_PERCENT}% · pause at ${BOUNCE_PAUSE_PERCENT}%`}
                  description={`Pause at ${BOUNCE_PAUSE_PERCENT}% over the selected period. SES pauses sending at a ${BOUNCE_PAUSE_PERCENT}% bounce rate.`}
                />
                <RateMeter
                  label="Complaint rate"
                  value={formatRate(summary.complaintRate)}
                  fill={meterFill(
                    summary.complaintRate,
                    COMPLAINT_PAUSE_PERCENT
                  )}
                  tone={limitTone(
                    summary.complaintRate,
                    COMPLAINT_WARN_PERCENT,
                    COMPLAINT_PAUSE_PERCENT
                  )}
                  markers={`Warn at ${COMPLAINT_WARN_PERCENT}% · pause at ${COMPLAINT_PAUSE_PERCENT}%`}
                  description={`Pause at ${COMPLAINT_PAUSE_PERCENT}% over the selected period. SES pauses sending at a ${COMPLAINT_PAUSE_PERCENT}% complaint rate.`}
                />
              </div>
            </Panel>
            <Panel title="Engagement" testId="dashboard-engagement">
              {engagementQuery.isError ? (
                <InlineErrorCard
                  message={
                    isApiError(engagementQuery.error)
                      ? engagementQuery.error.message
                      : "Could not load engagement."
                  }
                  requestId={
                    isApiError(engagementQuery.error)
                      ? engagementQuery.error.requestId
                      : null
                  }
                  onRetry={() => {
                    void engagementQuery.refetch()
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <RateMeter
                    label="Open rate"
                    value={formatRate(summary.openRate)}
                    fill={meterFill(summary.openRate, OPEN_TARGET_PERCENT)}
                    tone={targetTone(
                      summary.openRate,
                      OPEN_WATCH_PERCENT,
                      OPEN_TARGET_PERCENT
                    )}
                    markers={`Watch below ${OPEN_WATCH_PERCENT}% · target ${OPEN_TARGET_PERCENT}%`}
                    description="Opens divided by delivered in the selected period."
                  />
                  <RateMeter
                    label="Click rate"
                    value={formatRate(summary.clickRate)}
                    fill={meterFill(summary.clickRate, CLICK_TARGET_PERCENT)}
                    tone={targetTone(
                      summary.clickRate,
                      CLICK_WATCH_PERCENT,
                      CLICK_TARGET_PERCENT
                    )}
                    markers={`Watch below ${CLICK_WATCH_PERCENT}% · target ${CLICK_TARGET_PERCENT}%`}
                    description="Clicks divided by delivered in the selected period."
                  />
                  <RateMeter
                    label="Unsubscribe rate"
                    value={formatRate(summary.unsubscribeRate)}
                    fill={meterFill(
                      summary.unsubscribeRate,
                      UNSUBSCRIBE_PAUSE_PERCENT
                    )}
                    tone={limitTone(
                      summary.unsubscribeRate,
                      UNSUBSCRIBE_WATCH_PERCENT,
                      UNSUBSCRIBE_PAUSE_PERCENT
                    )}
                    markers={`Watch at ${UNSUBSCRIBE_WATCH_PERCENT}% · pause at ${UNSUBSCRIBE_PAUSE_PERCENT}%`}
                    description="Unsubscribes divided by delivered in the selected period."
                  />
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div className="space-y-4">
          <OpenAlerts alerts={data.open_alerts} />
          <Panel title="Integrations" testId="dashboard-integrations">
            <ul className="space-y-3">
              {integrations.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{item.name}</p>
                    <p className="truncate text-caption text-fg-muted">
                      {item.detail}
                    </p>
                  </div>
                  <StatusBadge variant={item.tone}>{item.label}</StatusBadge>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <SendsTable sends={sends} />
    </>
  )
}

export function DashboardPage() {
  const summary = useDashboardSummary()
  const [rangeDays, setRangeDays] = useState<(typeof RANGES)[number]["days"]>(7)
  const [schedule, setSchedule] = useState<ScheduleFilter>("all")

  return (
    <div className="space-y-4" data-testid="dashboard-page">
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <label>
              <span className="sr-only">Schedule</span>
              <select
                className={selectClass}
                value={schedule}
                onChange={(event) =>
                  setSchedule(event.target.value as ScheduleFilter)
                }
                data-testid="dashboard-schedule"
              >
                <option value="all">Schedule</option>
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Date range</span>
              <select
                className={selectClass}
                value={String(rangeDays)}
                onChange={(event) =>
                  setRangeDays(
                    Number(
                      event.target.value
                    ) as (typeof RANGES)[number]["days"]
                  )
                }
                data-testid="dashboard-range"
              >
                {RANGES.map((item) => (
                  <option key={item.days} value={item.days}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

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

      {summary.data ? (
        <DashboardBody
          data={summary.data}
          rangeDays={rangeDays}
          schedule={schedule}
        />
      ) : null}
    </div>
  )
}
