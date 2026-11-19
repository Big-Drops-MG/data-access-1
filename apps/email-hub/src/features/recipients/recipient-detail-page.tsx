"use client"

import Link from "next/link"
import { useMemo, type ReactNode } from "react"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import {
  emailTypeLabel,
  messageDetail,
  recipientStatusLabel,
  shortRecipientId,
} from "@/features/recipients/labels"
import { RecipientMessageStatusBadge } from "@/features/recipients/recipient-message-status-badge"
import { RecipientTierBadge } from "@/features/recipients/recipient-tier-badge"
import { useRecipientDetail } from "@/features/recipients/use-recipient-detail"
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
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  )
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
    return {
      delivered,
      total: messages.length,
      bounced,
    }
  }, [row?.messages])

  if (detail.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Recipient" />
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
      <div className="space-y-2">
        <p className="text-caption text-fg-muted">
          <Link href="/recipients" className="hover:text-fg hover:underline">
            Recipients
          </Link>
          <span aria-hidden> / </span>
          <span>{shortId}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {[row.first_name, row.last_name].filter(Boolean).join(" ") ||
              row.email}
          </h1>
          {row.status === "active" ? (
            <StatusBadge status="active" />
          ) : (
            <StatusBadge variant="err">
              {recipientStatusLabel(row.status)}
            </StatusBadge>
          )}
          <RecipientTierBadge tier={row.tier} />
        </div>
        <p className="text-sm text-fg-muted">
          {shortId}
          {" · "}
          {row.email}
          {row.external_user_id ? ` · ${row.external_user_id}` : ""}
          {" · "}
          first seen{" "}
          <EtDateTime
            value={row.created_at}
            className="inline text-sm text-fg-muted"
          />
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard title="Delivery">
          <MetricRow
            label="Delivered"
            value={`${delivery.delivered} of ${delivery.total || 0}`}
          />
          <MetricRow
            label="Bounces"
            value={delivery.bounced > 0 ? String(delivery.bounced) : "None"}
          />
        </SummaryCard>
        <SummaryCard title="Engagement">
          {delivery.total === 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-fg">No messages yet</p>
              <p className="text-[13px] text-fg-muted">
                Activity appears after the first send.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-fg">
                Recent sends on record
              </p>
              <p className="text-[13px] text-fg-muted">
                Opens and clicks are shown when tracking events arrive.
              </p>
            </div>
          )}
        </SummaryCard>
        <SummaryCard title="Environment">
          <div className="space-y-1">
            <p className="text-sm font-medium text-fg">No environment data</p>
            <p className="text-[13px] text-fg-muted">
              We learn the client and device from the first open.
            </p>
          </div>
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
                    <th className="px-4 py-2.5 font-medium">Type</th>
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
                        {emailTypeLabel(message.email_type)}
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
                      {preference.category_name}
                    </p>
                    <p className="truncate text-[12px] text-fg-muted">
                      {preference.category_key.replaceAll("_", " ")}
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
