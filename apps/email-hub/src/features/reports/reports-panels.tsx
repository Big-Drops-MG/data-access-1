"use client"

import { useState } from "react"

import { formatEtDateTime } from "@workspace/shared/client"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { StatusBadge } from "@/components/app/status-badge"
import { isApiError } from "@/lib/api-client"

import type { InboxPlacementPayload } from "./api"
import { DeliveredBouncedChart } from "./delivered-bounced-chart"
import { EmailClientChart, OpenFrequencyChart } from "./engagement-charts"
import type { EngagementView, ProviderView, SendView } from "./model"
import {
  EmptyNote,
  formatCount,
  formatPercent,
  KpiGrid,
  ListMark,
  PlacementMark,
  ReportSection,
  ReportTable,
  SingleBars,
} from "./reports-widgets"

function panelError(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback
}

function requestId(error: unknown): string | null {
  return isApiError(error) ? (error.requestId ?? null) : null
}

export function SendPanel({
  isLoading,
  error,
  onRetry,
  view,
  from,
  to,
  rangeLabel,
}: {
  isLoading: boolean
  error: unknown
  onRetry: () => void
  view: SendView | null
  from: string
  to: string
  rangeLabel: string
}) {
  if (isLoading && !view) {
    return <PageSkeleton withHeader={false} />
  }
  return (
    <div className="space-y-4" data-testid="reports-send">
      {error ? (
        <InlineErrorCard
          message={panelError(error, "Could not load sending reports.")}
          requestId={requestId(error)}
          onRetry={onRetry}
        />
      ) : null}
      {view ? (
        <>
          <KpiGrid
            items={[
              { label: "Sent", value: formatCount(view.kpis.sent) },
              {
                label: "Delivered",
                value:
                  view.kpis.deliveredRate == null
                    ? "0%"
                    : formatPercent(view.kpis.deliveredRate, 1),
              },
              {
                label: "Bounced",
                value:
                  view.kpis.bouncedRate == null
                    ? "0%"
                    : formatPercent(view.kpis.bouncedRate, 2),
              },
              {
                label: "Complaints",
                value: formatCount(view.kpis.complaints),
              },
              {
                label: "Unsubscribes",
                value: formatCount(view.kpis.unsubscribes),
              },
            ]}
          />
          <DeliveredBouncedChart
            rows={view.daily.map((row) => ({
              day: row.day,
              label: row.label,
              delivered: row.delivered,
              bounced: row.bounced,
            }))}
            from={from}
            to={to}
            rangeLabel={rangeLabel}
            testId="reports-send-chart"
          />
          <ReportSection title="By sending domain" testId="reports-by-domain">
            <VolumeTable
              rows={view.domains}
              empty="No sending domains in this range."
              testId="reports-domain-table"
              firstHeader="Sending domain"
            />
          </ReportSection>
          <ReportSection title="By sending IP" testId="reports-by-ip">
            <ReportTable
              columns={[
                "Sending IP",
                "Sent",
                "Delivered",
                "Bounced",
                "Open",
                "Clicked",
                "Unsub",
                "Bounce",
              ]}
              rows={[]}
              empty="Delivery events do not record a sending IP."
              testId="reports-ip-table"
            />
          </ReportSection>
          <ReportSection title="By day" testId="reports-by-day">
            <VolumeTable
              rows={view.days}
              empty="No daily totals in this range."
              testId="reports-day-table"
              firstHeader="Date"
            />
          </ReportSection>
        </>
      ) : null}
    </div>
  )
}

function VolumeTable({
  rows,
  empty,
  testId,
  firstHeader,
}: {
  rows: SendView["domains"]
  empty: string
  testId: string
  firstHeader: string
}) {
  return (
    <ReportTable
      testId={testId}
      empty={empty}
      columns={[
        firstHeader,
        "Sent",
        "Delivered",
        "Bounced",
        "Open",
        "Clicked",
        "Unsub",
        "Bounce",
      ]}
      rows={rows.map((row) => ({
        id: row.key,
        cells: [
          row.label,
          formatCount(row.sent),
          formatCount(row.delivered),
          formatCount(row.bounced),
          formatCount(row.opens),
          formatCount(row.clicks),
          formatCount(row.unsubscribes),
          row.bounceRate == null ? "0%" : formatPercent(row.bounceRate, 2),
        ],
      }))}
    />
  )
}

export function EngagementPanel({
  isLoading,
  error,
  onRetry,
  view,
  includeMachine,
  domainFiltered,
}: {
  isLoading: boolean
  error: unknown
  onRetry: () => void
  view: EngagementView | null
  includeMachine: boolean
  domainFiltered: boolean
}) {
  if (isLoading && !view) {
    return <PageSkeleton withHeader={false} />
  }
  return (
    <div className="space-y-4" data-testid="reports-engagement">
      {error ? (
        <InlineErrorCard
          message={panelError(error, "Could not load engagement reports.")}
          requestId={requestId(error)}
          onRetry={onRetry}
        />
      ) : null}
      {domainFiltered ? (
        <p className="text-sm text-fg-muted">
          Email client, devices, location, and top links are not split by
          sending domain.
        </p>
      ) : null}
      {view ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <OpenFrequencyChart
              rows={view.frequency}
              includeMachine={includeMachine}
              testId="reports-open-frequency"
            />
            <EmailClientChart
              rows={view.clients}
              testId="reports-email-client"
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ReportSection title="Top links" testId="reports-top-links">
              <ReportTable
                testId="reports-links-table"
                empty="No link clicks in this range."
                columns={["Link", "Unique", "Total", "Position"]}
                rows={view.links.map((row) => ({
                  id: row.url,
                  cells: [row.url, "—", formatCount(row.clicks), "—"],
                }))}
              />
            </ReportSection>
            <ReportSection
              title="Unsubscribes per send"
              description="Grouped by email type. Delivered comes from the sending rollup."
              testId="reports-unsubscribes"
            >
              <ReportTable
                testId="reports-unsub-table"
                empty="No unsubscribes in this range."
                columns={["Send", "Delivered", "Unsubscribed", "Rate"]}
                rows={view.unsubscribes.map((row) => ({
                  id: row.label,
                  cells: [
                    row.label,
                    formatCount(row.delivered),
                    formatCount(row.unsubscribed),
                    formatPercent(row.rate, 2),
                  ],
                }))}
              />
            </ReportSection>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ReportSection title="Devices" testId="reports-devices">
              <ReportTable
                testId="reports-devices-table"
                empty="No device data in this range."
                columns={["Device / OS", "Opens", "Clicks"]}
                rows={view.devices.map((row) => ({
                  id: row.label,
                  cells: [
                    row.label,
                    formatCount(row.opens),
                    formatCount(row.clicks),
                  ],
                }))}
              />
            </ReportSection>
            <ReportSection
              title="Location"
              description="State or region from the open and click environment rollup."
              testId="reports-location"
            >
              <ReportTable
                testId="reports-location-table"
                empty="No location data in this range."
                columns={["State (approx.)", "Clicks", "Unsubscribed"]}
                rows={view.locations.map((row) => ({
                  id: row.label,
                  cells: [
                    row.label,
                    formatCount(row.clicks),
                    formatCount(row.unsubscribes),
                  ],
                }))}
              />
            </ReportSection>
          </div>
        </>
      ) : null}
    </div>
  )
}

const SEED_PROVIDERS = ["gmail", "yahoo", "outlook", "aol", "icloud"] as const

export function InboxPanel({
  isLoading,
  error,
  onRetry,
  report,
}: {
  isLoading: boolean
  error: unknown
  onRetry: () => void
  report: InboxPlacementPayload | null
}) {
  const [noticeOpen, setNoticeOpen] = useState(true)
  if (isLoading && !report) {
    return <PageSkeleton withHeader={false} />
  }
  return (
    <div className="space-y-4" data-testid="reports-inbox">
      {error ? (
        <InlineErrorCard
          message={panelError(error, "Could not load inbox placement.")}
          requestId={requestId(error)}
          onRetry={onRetry}
        />
      ) : null}
      {noticeOpen ? (
        <aside
          className="flex items-start justify-between gap-4 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-fg"
          data-testid="reports-icloud-notice"
        >
          <p>
            iCloud has no feedback loop or postmaster tool. Its numbers come
            only from the seeded iCloud inbox and Apple bounce and defer codes,
            so treat them as a sample.
          </p>
          <button
            type="button"
            className="shrink-0 text-sm font-medium text-link hover:underline"
            onClick={() => setNoticeOpen(false)}
          >
            Close
          </button>
        </aside>
      ) : null}
      {report ? (
        <>
          <ReportSection
            title="Placement · last 24 hours"
            description="Seed inboxes only, checked against the provider when a report exists."
            testId="reports-placement"
          >
            <ReportTable
              testId="reports-placement-table"
              empty="No seed placement checks in the last 24 hours."
              columns={[
                "Provider",
                "Inbox",
                "Promotions",
                "Spam",
                "Source",
                "Confidence",
              ]}
              rows={report.placement.map((row) => ({
                id: row.provider,
                cells: [
                  row.label,
                  formatCount(row.inbox),
                  formatCount(row.promotions),
                  formatCount(row.spam),
                  row.source,
                  <span
                    key={row.provider}
                    className={
                      row.confidence_tone === "ok" ? "text-ok" : "text-warn"
                    }
                  >
                    {row.confidence_label}
                  </span>,
                ],
              }))}
            />
          </ReportSection>
          <ReportSection
            title="Latest seed results"
            testId="reports-seed-results"
          >
            <ReportTable
              testId="reports-seed-table"
              empty="No seed results in this range."
              columns={[
                "Send",
                "Template",
                "Gmail",
                "Yahoo",
                "Outlook",
                "AOL",
                "iCloud",
              ]}
              rows={report.latest_sends.map((row) => ({
                id: row.id,
                cells: [
                  row.sent_at ? formatEtDateTime(row.sent_at) : "—",
                  row.template,
                  ...SEED_PROVIDERS.map((provider) => (
                    <PlacementMark
                      key={provider}
                      value={row.placements[provider]}
                    />
                  )),
                ],
              }))}
            />
          </ReportSection>
          <ReportSection
            title="Blocklists"
            description="Checked on the blocklist schedule. Latest result in this range."
            testId="reports-blocklists"
          >
            <ReportTable
              testId="reports-blocklist-table"
              empty="No blocklist checks in this range."
              columns={["Sending IP", "Spamhaus", "Barracuda", "Checked"]}
              rows={report.blocklists.map((row) => ({
                id: row.target,
                cells: [
                  row.target,
                  <ListMark key="spamhaus" value={row.spamhaus} />,
                  <ListMark key="barracuda" value={row.barracuda} />,
                  formatEtDateTime(row.checked_at),
                ],
              }))}
            />
          </ReportSection>
        </>
      ) : null}
    </div>
  )
}

export function ProviderPanel({
  isLoading,
  error,
  onRetry,
  view,
  rangeLabel,
}: {
  isLoading: boolean
  error: unknown
  onRetry: () => void
  view: ProviderView | null
  rangeLabel: string
}) {
  if (isLoading && !view) {
    return <PageSkeleton withHeader={false} />
  }
  return (
    <div className="space-y-4" data-testid="reports-provider">
      {error ? (
        <InlineErrorCard
          message={panelError(error, "Could not load provider metrics.")}
          requestId={requestId(error)}
          onRetry={onRetry}
        />
      ) : null}
      {view ? (
        <>
          <ReportSection
            title={
              view.selectedDomain
                ? `Gmail spam rate · ${view.selectedDomain}`
                : "Gmail spam rate"
            }
            description="Google asks bulk senders to stay under 0.3% and never reach 0.5%."
            testId="reports-spam-chart"
          >
            {view.spamSeries.length === 0 ? (
              <EmptyNote>No Gmail spam-rate points in this range.</EmptyNote>
            ) : (
              <SingleBars
                rows={view.spamSeries.map((row) => ({
                  label: row.label,
                  value: row.rate,
                }))}
              />
            )}
          </ReportSection>
          <div className="grid gap-4 xl:grid-cols-2">
            <ReportSection
              title="Google Postmaster"
              testId="reports-postmaster"
            >
              <ReportTable
                testId="reports-postmaster-table"
                empty="No Postmaster domains in this range."
                columns={[
                  "Domain",
                  "Domain reputation",
                  "Spam rate",
                  "Authenticated",
                  "Pulled",
                ]}
                rows={view.postmaster.map((row) => ({
                  id: row.domain,
                  cells: [
                    row.domain,
                    <StatusBadge key={row.domain} variant={row.reputationTone}>
                      {row.reputation}
                    </StatusBadge>,
                    formatPercent(row.spamRate, 2),
                    "—",
                    row.pulled,
                  ],
                }))}
              />
            </ReportSection>
            <ReportSection
              title="Feedback sources"
              testId="reports-feedback-sources"
            >
              <ReportTable
                testId="reports-sources-table"
                empty="No provider feedback in this range."
                columns={["Source", "What it reports", rangeLabel, "Status"]}
                rows={view.sources.map((row) => ({
                  id: row.source,
                  cells: [
                    row.source,
                    row.reports,
                    row.summary,
                    row.healthy ? (
                      <StatusBadge key={row.source} variant="ok">
                        Healthy
                      </StatusBadge>
                    ) : (
                      <StatusBadge key={row.source} variant="neutral">
                        No data
                      </StatusBadge>
                    ),
                  ],
                }))}
              />
            </ReportSection>
          </div>
        </>
      ) : null}
    </div>
  )
}
