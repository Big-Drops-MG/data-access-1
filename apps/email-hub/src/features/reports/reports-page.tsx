"use client"

import { Download } from "lucide-react"
import { useMemo, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { PageHeader } from "@/components/app/page-header"

import {
  buildEngagementView,
  buildProviderView,
  buildSendView,
  normalizeEngagementRows,
  normalizeEnvironmentRows,
  normalizeFrequencyRows,
  normalizeLinkRows,
  normalizeProviderRows,
  normalizeSendingRows,
  reportWindow,
  sendingDomainOptions,
  shortDayLabel,
  toCsv,
  type VolumeRow,
} from "./model"
import {
  EngagementPanel,
  InboxPanel,
  ProviderPanel,
  SendPanel,
} from "./reports-panels"
import {
  reportsOutlineButtonClass,
  reportsSelectClass,
} from "./reports-widgets"
import { useReportsQueries } from "./use-reports"

const TABS = [
  { id: "send", label: "Send" },
  { id: "engagement", label: "Engagement" },
  { id: "inbox", label: "Inbox placement" },
  { id: "provider", label: "Provider health" },
] as const

type ReportTab = (typeof TABS)[number]["id"]

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const

function volumeCsv(rows: VolumeRow[]): string {
  return toCsv(
    [
      "label",
      "sent",
      "delivered",
      "bounced",
      "opens",
      "clicks",
      "unsubscribes",
      "bounce_rate",
    ],
    rows.map((row) => [
      row.label,
      String(row.sent),
      String(row.delivered),
      String(row.bounced),
      String(row.opens),
      String(row.clicks),
      String(row.unsubscribes),
      row.bounceRate == null ? "" : String(row.bounceRate),
    ])
  )
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("send")
  const [rangeDays, setRangeDays] = useState<(typeof RANGES)[number]["days"]>(7)
  const [domain, setDomain] = useState("all")
  const [providerDomain, setProviderDomain] = useState<string | null>(null)
  const [includeMachine, setIncludeMachine] = useState(false)

  const range = useMemo(() => reportWindow(rangeDays), [rangeDays])
  const rangeLabel =
    RANGES.find((item) => item.days === rangeDays)?.label ?? "Last 7 days"
  const selectedDomain = domain === "all" ? null : domain
  const queries = useReportsQueries({
    from: range.from,
    to: range.to,
    includeMachine,
    domain: selectedDomain,
  })

  const sendingRows = useMemo(
    () => normalizeSendingRows(queries.sending.data?.data ?? []),
    [queries.sending.data]
  )
  const engagementRows = useMemo(
    () => normalizeEngagementRows(queries.engagement.data?.data ?? []),
    [queries.engagement.data]
  )
  const domains = useMemo(
    () => sendingDomainOptions(sendingRows),
    [sendingRows]
  )
  const sendView = useMemo(
    () =>
      queries.sending.data
        ? buildSendView({
            sending: sendingRows,
            engagement: engagementRows,
            domain: selectedDomain,
          })
        : null,
    [engagementRows, queries.sending.data, selectedDomain, sendingRows]
  )
  const engagementView = useMemo(
    () =>
      queries.engagement.data || queries.environment.data
        ? buildEngagementView({
            sending: sendingRows,
            engagement: engagementRows,
            links: normalizeLinkRows(queries.links.data?.data ?? []),
            environment: normalizeEnvironmentRows(
              queries.environment.data?.data ?? []
            ),
            frequency: normalizeFrequencyRows(
              queries.frequency.data?.data ?? []
            ),
            domain: selectedDomain,
          })
        : null,
    [
      engagementRows,
      queries.engagement.data,
      queries.environment.data,
      queries.frequency.data,
      queries.links.data,
      selectedDomain,
      sendingRows,
    ]
  )
  const providerRows = useMemo(
    () => normalizeProviderRows(queries.provider.data?.data ?? []),
    [queries.provider.data]
  )
  const providerView = useMemo(
    () =>
      queries.provider.data
        ? buildProviderView(providerRows, providerDomain)
        : null,
    [providerDomain, providerRows, queries.provider.data]
  )

  function exportCurrent() {
    if (tab === "send" && sendView) {
      downloadCsv("reports-send.csv", volumeCsv(sendView.domains))
      return
    }
    if (tab === "engagement" && engagementView) {
      downloadCsv(
        "reports-engagement.csv",
        toCsv(
          ["link", "clicks"],
          engagementView.links.map((row) => [row.url, String(row.clicks)])
        )
      )
      return
    }
    if (tab === "inbox" && queries.inbox.data) {
      downloadCsv(
        "reports-inbox.csv",
        toCsv(
          ["provider", "inbox", "promotions", "spam", "source"],
          queries.inbox.data.placement.map((row) => [
            row.label,
            String(row.inbox),
            String(row.promotions),
            String(row.spam),
            row.source,
          ])
        )
      )
      return
    }
    if (tab === "provider" && providerView) {
      downloadCsv(
        "reports-provider.csv",
        toCsv(
          ["domain", "reputation", "spam_rate", "pulled"],
          providerView.postmaster.map((row) => [
            row.domain,
            row.reputation,
            row.spamRate == null ? "" : String(row.spamRate),
            row.pulled,
          ])
        )
      )
    }
  }

  const domainControl =
    tab === "provider" ? (
      <label className="inline-flex items-center gap-2 text-sm text-fg">
        <span className="sr-only">Postmaster domain</span>
        <select
          className={reportsSelectClass}
          value={providerView?.selectedDomain ?? ""}
          onChange={(event) => setProviderDomain(event.target.value)}
          data-testid="reports-provider-domain"
        >
          {(providerView?.domains.length ?? 0) === 0 ? (
            <option value="">No domains</option>
          ) : (
            providerView?.domains.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))
          )}
        </select>
      </label>
    ) : (
      <label className="inline-flex items-center gap-2 text-sm text-fg">
        <span className="sr-only">Sending domain</span>
        <select
          className={reportsSelectClass}
          value={domains.includes(domain) || domain === "all" ? domain : "all"}
          onChange={(event) => setDomain(event.target.value)}
          data-testid="reports-domain"
        >
          <option value="all">All domains</option>
          {domains.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    )

  return (
    <div className="space-y-6" data-testid="reports-page">
      <PageHeader
        title="Reports"
        meta={`${shortDayLabel(range.from)} – ${shortDayLabel(range.to)} ET`}
        actions={
          <>
            <label>
              <span className="sr-only">Date range</span>
              <select
                className={reportsSelectClass}
                value={String(rangeDays)}
                onChange={(event) =>
                  setRangeDays(
                    Number(
                      event.target.value
                    ) as (typeof RANGES)[number]["days"]
                  )
                }
                data-testid="reports-range"
              >
                {RANGES.map((item) => (
                  <option key={item.days} value={item.days}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {domainControl}
            <button
              type="button"
              className={reportsOutlineButtonClass}
              onClick={exportCurrent}
              data-testid="reports-export"
            >
              <Download className="size-3.5" strokeWidth={1.75} aria-hidden />
              Export CSV
            </button>
          </>
        }
      />

      <nav aria-label="Report sections" data-testid="reports-tabs">
        <ul className="flex flex-wrap items-center gap-5 border-b border-border">
          {TABS.map((item) => {
            const active = tab === item.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    "relative inline-flex items-center border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors outline-none",
                    active
                      ? "border-fg text-fg"
                      : "border-transparent text-fg-muted hover:text-fg"
                  )}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                  data-testid={`reports-tab-${item.id}`}
                >
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {tab === "send" ? (
        <SendPanel
          isLoading={queries.sending.isPending}
          error={queries.sending.error}
          onRetry={() => {
            void queries.sending.refetch()
            void queries.engagement.refetch()
          }}
          view={sendView}
          rangeLabel={rangeLabel}
        />
      ) : null}
      {tab === "engagement" ? (
        <EngagementPanel
          isLoading={
            queries.engagement.isPending ||
            queries.environment.isPending ||
            queries.frequency.isPending
          }
          error={
            queries.engagement.error ??
            queries.environment.error ??
            queries.links.error ??
            queries.frequency.error
          }
          onRetry={() => {
            void queries.engagement.refetch()
            void queries.environment.refetch()
            void queries.links.refetch()
            void queries.frequency.refetch()
          }}
          view={engagementView}
          includeMachine={includeMachine}
          onIncludeMachine={setIncludeMachine}
          domainFiltered={selectedDomain != null}
        />
      ) : null}
      {tab === "inbox" ? (
        <InboxPanel
          isLoading={queries.inbox.isPending}
          error={queries.inbox.error}
          onRetry={() => {
            void queries.inbox.refetch()
          }}
          report={queries.inbox.data ?? null}
        />
      ) : null}
      {tab === "provider" ? (
        <ProviderPanel
          isLoading={queries.provider.isPending}
          error={queries.provider.error}
          onRetry={() => {
            void queries.provider.refetch()
          }}
          view={providerView}
          rangeLabel={rangeLabel}
        />
      ) : null}
    </div>
  )
}
