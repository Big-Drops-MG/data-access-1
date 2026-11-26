"use client"

import Link from "next/link"
import { useMemo, type ReactNode } from "react"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import {
  emailTypeLabel,
  messageDetail,
  shortRecipientId,
} from "@/features/recipients/labels"
import { RecipientMessageStatusBadge } from "@/features/recipients/recipient-message-status-badge"
import { RecipientStatusBadge } from "@/features/recipients/recipient-status-badge"
import { RecipientTierBadge } from "@/features/recipients/recipient-tier-badge"
import { useRecipientDetail } from "@/features/recipients/use-recipient-detail"
import type { RecipientMessageJson } from "@/lib/recipients/serialize"
import { isApiError } from "@/lib/api-client"
import { cn } from "@workspace/ui/lib/utils"

type RecipientDetailPageProps = {
  recipientId: string
}

function SummaryCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-caption font-medium tracking-wide text-fg-muted uppercase">
          {title}
        </h2>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-medium text-fg">{value}</span>
    </div>
  )
}

function preferenceTitle(key: string, name: string): string {
  if (key === "thank_you") {
    return "Transactional"
  }
  if (key === "feedback_request") {
    return "Feedback requests"
  }
  return name
}

function averageDeliveryLabel(messages: RecipientMessageJson[]): string {
  const samples = messages.flatMap((message) => {
    if (
      (message.status !== "delivered" && message.status !== "sent") ||
      !message.sent_at ||
      !message.queued_at
    ) {
      return []
    }
    const seconds =
      (new Date(message.sent_at).getTime() -
        new Date(message.queued_at).getTime()) /
      1000
    return seconds >= 0 ? [seconds] : []
  })
  if (samples.length === 0) {
    return "—"
  }
  const average =
    samples.reduce((sum, value) => sum + value, 0) / samples.length
  return `${average.toFixed(1)} s`
}

export function RecipientDetailPage({ recipientId }: RecipientDetailPageProps) {
  const detail = useRecipientDetail(recipientId)
  const row = detail.data

  const delivery = useMemo(() => {
    const messages = row?.messages ?? []
    const delivered = messages.filter(
      (message) => message.status === "delivered" || message.status === "sent"
    ).length
    const bounced = messages.filter(
      (message) => message.status === "bounced"
    ).length
    const complained = messages.filter(
      (message) => message.status === "complained"
    ).length
    return {
      delivered,
      total: messages.length,
      bounced,
      complained,
      average: averageDeliveryLabel(messages),
    }
  }, [row?.messages])

  if (detail.isError) {
    return (
      <div className="space-y-6">
        <InlineErrorCard
          message={
            isApiError(detail.error)
              ? detail.error.message
              : "Could not load recipient."
          }
          requestId={isApiError(detail.error) ? detail.error.requestId : null}
          onRetry={() => {
            void detail.refetch()
          }}
        />
      </div>
    )
  }

  if (detail.isPending || !row) {
    return (
      <div
        className="h-48 animate-pulse rounded-xl bg-surface-2"
        data-testid="recipient-detail-loading"
        aria-hidden
      />
    )
  }

  const shortId = shortRecipientId(row.id)

  return (
    <div className="space-y-6" data-testid="recipient-detail">
      <header className="space-y-2">
        <p className="text-caption text-fg-muted">
          <Link href="/recipients" className="hover:text-fg hover:underline">
            Recipients
          </Link>
          <span aria-hidden> / </span>
          <span>{shortId}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {row.email}
          </h1>
          <RecipientStatusBadge
            status={row.status}
            unsubscribed={row.unsubscribed}
          />
          <RecipientTierBadge tier={row.tier} />
        </div>
        <p className="text-sm text-fg-muted">
          {shortId}
          {" · First seen "}
          <EtDateTime
            value={row.created_at}
            className="inline text-sm text-fg-muted"
          />
          {row.offer ? ` · ${row.offer.external_ref}` : ""}
          {" · tier from Arohaa at "}
          <EtDateTime
            value={row.tier_updated_at}
            className="inline text-sm text-fg-muted"
          />
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard title="Delivery">
          <MetricRow
            label="Delivered"
            value={`${delivery.delivered} of ${delivery.total}`}
          />
          <MetricRow label="Avg. delivery time" value={delivery.average} />
          <MetricRow
            label="Bounces"
            value={delivery.bounced > 0 ? String(delivery.bounced) : "None"}
          />
          <MetricRow label="Deferrals" value="None" />
          <MetricRow
            label="Complaints"
            value={
              delivery.complained > 0 ? String(delivery.complained) : "None"
            }
          />
        </SummaryCard>
        <SummaryCard title="Subscribed">
          <MetricRow label="Opens" value="None" />
          <MetricRow label="Clicks" value="None" />
          <MetricRow label="Time to click" value="—" />
          <MetricRow label="Best time" value="—" />
          <MetricRow label="Replies" value="None ingested" />
        </SummaryCard>
        <SummaryCard title="Environment">
          <MetricRow label="Client" value="Not detected" />
          <MetricRow label="Device" value="Not detected" />
          <MetricRow label="Dark mode" value="Not detected" />
          <MetricRow label="Location" value="None" />
        </SummaryCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-fg">Messages</h2>
            <p className="text-[12px] text-fg-muted">Last 50</p>
          </header>
          {row.messages.length === 0 ? (
            <p
              className="px-4 py-10 text-center text-sm text-fg-muted"
              data-testid="recipient-messages-empty"
            >
              No messages for this recipient yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead className="bg-surface-2 text-caption font-medium tracking-wide text-fg-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Sent (ET)</th>
                    <th className="px-4 py-2.5 font-medium">Template</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {row.messages.map((message) => (
                    <tr
                      key={message.id}
                      className="border-t border-border"
                      data-testid="recipient-message-row"
                    >
                      <td className="px-4 py-2.5 text-fg-muted">
                        <EtDateTime
                          value={message.sent_at ?? message.created_at}
                          className="text-[13px] text-fg-muted"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-fg">
                        {message.template_name ??
                          emailTypeLabel(message.email_type)}
                      </td>
                      <td className="px-4 py-2.5">
                        <RecipientMessageStatusBadge status={message.status} />
                      </td>
                      <td className="px-4 py-2.5 text-fg-muted">
                        {messageDetail(message)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-fg">Preferences</h2>
          </header>
          <ul
            className="divide-y divide-border"
            data-testid="recipient-preferences"
          >
            {row.preferences.map((preference) => {
              const subscribed = !preference.opted_out
              const alwaysSent =
                preference.kind === "transactional" &&
                preference.category_key === "thank_you"
              return (
                <li
                  key={preference.category_id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {preferenceTitle(
                        preference.category_key,
                        preference.category_name
                      )}
                    </p>
                    <p className="truncate text-[12px] text-fg-muted">
                      {preferenceDescription(preference)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-[13px] font-medium",
                      alwaysSent || subscribed ? "text-ok" : "text-fg-muted"
                    )}
                  >
                    {alwaysSent
                      ? "Always sent"
                      : subscribed
                        ? "Subscribed"
                        : "Opted out"}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

function preferenceDescription(preference: {
  category_key: string
  category_name: string
}): string {
  if (preference.category_key === "thank_you") {
    return "Thank-you receipts"
  }
  if (preference.category_key === "feedback_request") {
    return "Ask premium users for feedback"
  }
  if (preference.category_key === "engagement") {
    return "Monthly updates"
  }
  return preference.category_name
}
