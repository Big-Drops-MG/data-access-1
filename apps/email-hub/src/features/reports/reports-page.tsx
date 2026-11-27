"use client"

import { Download } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

import {
  DateRangePicker,
  resolveDateRangePreset,
  type DateRangeSelection,
} from "@/components/app/date-range-picker"
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
  sendingDomainOptions,
  toCsv,
  type VolumeRow,
} from "./model"
import {
  EngagementPanel,
  InboxPanel,
  ProviderPanel,
  SendPanel,
} from "./reports-panels"
import { reportsOutlineButtonClass } from "./reports-widgets"
import { useReportsQueries } from "./use-reports"

const TABS = [
  { id: "send", label: "Send" },
  { id: "engagement", label: "Engagement" },
  { id: "inbox", label: "Inbox placement" },
  { id: "provider", label: "Provider health" },
] as const

type ReportTab = (typeof TABS)[number]["id"]

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
  const [dateRange, setDateRange] = useState<DateRangeSelection>(() =>
    resolveDateRangePreset("last_7_days")
  )
  const [domain, setDomain] = useState("all")
  const [providerDomain, setProviderDomain] = useState<string | null>(null)
  const includeMachine = false

  const range = { from: dateRange.from, to: dateRange.to }
  const rangeLabel = dateRange.label
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

  const domainTriggerClass =
    "h-9 min-w-[15rem] max-w-[22rem] rounded-md border-border bg-surface px-3 text-sm text-fg shadow-none transition-colors hover:bg-surface-2 focus-visible:border-border focus-visible:ring-0 focus-visible:shadow-[0_0_0_3px_var(--ring)]"
  const selectContentClass =
    "min-w-[14rem] rounded-lg border border-border bg-surface p-1 text-fg shadow-md ring-0"
  const selectItemClass =
    "rounded-md py-1.5 pr-8 pl-2.5 text-sm text-fg focus:bg-surface-2 focus:text-fg"

  const activeDomainValue =
    domains.includes(domain) || domain === "all" ? domain : "all"
  const activeDomainLabel =
    activeDomainValue === "all" ? "All domains" : activeDomainValue
  const providerDomains = providerView?.domains ?? []
  const activeProviderDomain = providerView?.selectedDomain ?? ""

  const domainControl =
    tab === "provider" ? (
      <Select
        value={activeProviderDomain || undefined}
        disabled={providerDomains.length === 0}
        onValueChange={(next) => {
          if (next != null) {
            setProviderDomain(next)
          }
        }}
      >
        <SelectTrigger
          aria-label="Postmaster domain"
          size="default"
          data-testid="reports-provider-domain"
          className={domainTriggerClass}
        >
          <SelectValue placeholder="No domains">
            {activeProviderDomain || "No domains"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="end"
          side="bottom"
          sideOffset={6}
          className={selectContentClass}
        >
          {providerDomains.map((item) => (
            <SelectItem key={item} value={item} className={selectItemClass}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <Select
        value={activeDomainValue}
        onValueChange={(next) => {
          if (next != null) {
            setDomain(next)
          }
        }}
      >
        <SelectTrigger
          aria-label="Sending domain"
          size="default"
          data-testid="reports-domain"
          className={domainTriggerClass}
        >
          <SelectValue placeholder="All domains">
            {activeDomainLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="end"
          side="bottom"
          sideOffset={6}
          className={selectContentClass}
        >
          <SelectItem value="all" className={selectItemClass}>
            All domains
          </SelectItem>
          {domains.map((item) => (
            <SelectItem key={item} value={item} className={selectItemClass}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )

  return (
    <div className="space-y-6" data-testid="reports-page">
      <PageHeader
        title="Reports"
        actions={
          <>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              testId="reports-range"
            />
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
          from={range.from}
          to={range.to}
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
