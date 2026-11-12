"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { StatusBadge } from "@/components/app/status-badge"
import {
  claimFeedback,
  decideFeedback,
  fetchFeedback,
  fetchFeedbackClassifications,
  type FeedbackDecisionValue,
  type FeedbackListItem,
} from "@/features/feedback/api"
import {
  claimExpiresInMs,
  feedbackDecisionLabel,
  feedbackSourceLabel,
  feedbackStatusToBadge,
  feedbackTypeLabel,
  formatClaimRemaining,
  formatWaiting,
  isClaimedByCurrentUser,
  shortFeedbackId,
  waitingMs,
} from "@/features/feedback/feedback-status"
import {
  feedbackCardBodyClass,
  feedbackCardClass,
  feedbackCardHeaderClass,
  feedbackDecisionOptionClass,
  feedbackDecisionPanelClass,
  feedbackOutlineControl,
  feedbackPrimaryControl,
  feedbackSelectContentClass,
  feedbackSelectItemClass,
  feedbackSelectTriggerClass,
} from "@/features/feedback/feedback-ui"
import { isApiError, isConflictError } from "@/lib/api-client"
import { detailQueryKey, listQueryKey } from "@/lib/query-keys"
import { detailQueryOptions, listQueryOptions } from "@/lib/query-options"
import { cn } from "@workspace/ui/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const DECISIONS: ReadonlyArray<{
  value: FeedbackDecisionValue
  label: string
  description: string
}> = [
  {
    value: "no_action",
    label: "Transactional",
    description: "Close the report. The address keeps receiving email.",
  },
  {
    value: "suppress",
    label: "Suppress",
    description:
      "Adds a global complaint suppression. Thank-you emails stop too.",
  },
  {
    value: "escalate",
    label: "Escalate",
    description: "Flag for an Admin to look at the template or offer.",
  },
]

type FeedbackDetailPageProps = {
  feedbackId: string
  currentUserId: string
  canWrite?: boolean
}

function MetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 border-b border-border/70 py-3 last:border-b-0">
      <dt className="pt-0.5 text-[13px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-[14px] leading-snug text-fg">{children}</dd>
    </div>
  )
}

function DetailCard({
  title,
  headingId,
  children,
}: {
  title: string
  headingId: string
  children: React.ReactNode
}) {
  return (
    <section className={feedbackCardClass} aria-labelledby={headingId}>
      <h2 id={headingId} className={feedbackCardHeaderClass}>
        {title}
      </h2>
      <dl className={feedbackCardBodyClass}>{children}</dl>
    </section>
  )
}

function statusBadgeLabel(
  item: FeedbackListItem,
  claimedByYou: boolean
): string {
  if (item.status === "in_review") {
    return claimedByYou ? "In review · you" : "In review · claimed"
  }
  if (item.status === "resolved") {
    return `${feedbackDecisionLabel(item.decision)}`
  }
  return "Pending"
}

function shortRecipientRef(recipientId: string | null): string | null {
  if (!recipientId) {
    return null
  }
  return `rcp_${recipientId.replace(/-/g, "").slice(0, 6)}`
}

export function FeedbackDetailPage({
  feedbackId,
  currentUserId,
  canWrite = false,
}: FeedbackDetailPageProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [classificationOverride, setClassificationOverride] = useState<
    string | undefined
  >(undefined)
  const [decision, setDecision] = useState<FeedbackDecisionValue>("suppress")
  const [note, setNote] = useState("")
  const [suppressNotice, setSuppressNotice] = useState(false)
  const [, setTick] = useState(0)

  const detail = useQuery({
    ...detailQueryOptions("feedback", feedbackId, () =>
      fetchFeedback(feedbackId)
    ),
    refetchInterval: 30_000,
  })

  const classifications = useQuery({
    ...listQueryOptions("feedback-classifications", () =>
      fetchFeedbackClassifications()
    ),
  })

  const item = detail.data
  const classificationId =
    classificationOverride ?? item?.classification_id ?? ""

  useEffect(() => {
    if (!item || item.status !== "in_review") {
      return
    }
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [item])

  const claimedByYou = item
    ? isClaimedByCurrentUser(item, currentUserId)
    : false
  const claimMs = item ? claimExpiresInMs(item) : null
  const canDecide = canWrite && item?.status === "in_review" && claimedByYou
  const recipientRef = shortRecipientRef(item?.recipient_id ?? null)

  const claimMutation = useMutation({
    mutationFn: () => claimFeedback(feedbackId),
    onSuccess: (next) => {
      queryClient.setQueryData(detailQueryKey("feedback", feedbackId), next)
      void queryClient.invalidateQueries({ queryKey: listQueryKey("feedback") })
      toast.success("Claimed for review")
    },
    onError: (error) => {
      toast.error(
        isConflictError(error)
          ? "Another reviewer already claimed this item"
          : isApiError(error)
            ? error.message
            : "Could not claim feedback"
      )
    },
  })

  const decideMutation = useMutation({
    mutationFn: () =>
      decideFeedback(feedbackId, {
        classification_id: classificationId,
        decision,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(detailQueryKey("feedback", feedbackId), next)
      void queryClient.invalidateQueries({ queryKey: listQueryKey("feedback") })
      if (next.decision === "suppress") {
        setSuppressNotice(true)
        toast.success("Suppression created from feedback review")
      } else {
        toast.success(`Marked as ${feedbackDecisionLabel(next.decision)}`)
      }
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.message : "Could not save decision")
    },
  })

  const subtitle = useMemo(() => {
    if (!item) {
      return null
    }
    const waiting = formatWaiting(waitingMs(item))
    return (
      <>
        {feedbackSourceLabel(item)} {feedbackTypeLabel(item).toLowerCase()} ·
        received <EtDateTime value={item.created_at} className="inline" /> ·
        waiting {waiting}
      </>
    )
  }, [item])

  if (detail.isError) {
    return (
      <InlineErrorCard
        message={
          isApiError(detail.error)
            ? detail.error.message
            : "Could not load feedback."
        }
        requestId={isApiError(detail.error) ? detail.error.requestId : null}
        onRetry={() => {
          void detail.refetch()
        }}
      />
    )
  }

  if (!item) {
    return (
      <div
        className="h-40 animate-pulse rounded-md bg-surface-2"
        data-testid="feedback-detail-loading"
        aria-hidden
      />
    )
  }

  const shortId = shortFeedbackId(item.id)
  const badgeStatus = feedbackStatusToBadge(item.status)

  return (
    <div className="space-y-6">
      <header className="space-y-2" data-testid="page-header">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
            <li className="flex items-center gap-1.5">
              <Link href="/feedback" className="text-link hover:underline">
                Feedback
              </Link>
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="text-fg-subtle">
                /
              </span>
              <span className="font-medium text-fg" aria-current="page">
                {shortId}
              </span>
            </li>
          </ol>
        </nav>

        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-h2 font-semibold tracking-tight text-fg">
            {shortId}
          </h1>
          <StatusBadge
            variant={
              badgeStatus === "pending"
                ? "warn"
                : badgeStatus === "decided"
                  ? "ok"
                  : "info"
            }
          >
            {statusBadgeLabel(item, claimedByYou)}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-[14px] text-fg-muted">{subtitle}</p>
          {item.status === "in_review" && claimedByYou && claimMs != null ? (
            <p
              className="shrink-0 text-[13px] text-fg-subtle"
              data-testid="feedback-claim-expiry"
            >
              Your claim expires in {formatClaimRemaining(claimMs)}
            </p>
          ) : null}
        </div>
      </header>

      {suppressNotice ? (
        <aside
          className="rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-[14px] text-fg"
          data-testid="feedback-suppress-notice"
          role="status"
        >
          Global complaint suppression created for{" "}
          <span className="font-mono">{item.email ?? "recipient"}</span>
          {" · "}
          <Link
            href="/suppression"
            className="text-link underline-offset-2 hover:underline"
          >
            Open suppression
          </Link>
        </aside>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <DetailCard title="Message" headingId="feedback-message">
            <MetaRow label="Recipient">
              {item.email ? (
                <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link
                    href={
                      item.recipient_id
                        ? `/recipients?q=${encodeURIComponent(item.recipient_id)}`
                        : "/recipients"
                    }
                    className="font-mono text-link hover:underline"
                  >
                    {item.email}
                  </Link>
                  {recipientRef ? (
                    <Link
                      href={`/recipients?q=${encodeURIComponent(item.recipient_id!)}`}
                      className="font-mono text-[12px] text-link hover:underline"
                    >
                      {recipientRef}
                    </Link>
                  ) : null}
                </span>
              ) : (
                "—"
              )}
            </MetaRow>
            <MetaRow label="Template">—</MetaRow>
            <MetaRow label="Sender">—</MetaRow>
            <MetaRow label="Offer">
              <span className="inline-flex rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-fg-muted">
                —
              </span>
            </MetaRow>
            <MetaRow label="Sent">
              <EtDateTime value={item.created_at} />
            </MetaRow>
            <MetaRow label="SES message id">
              {item.message_id ? (
                <span className="font-mono text-[13px] break-all text-fg-muted">
                  {item.message_id}
                </span>
              ) : (
                "—"
              )}
            </MetaRow>
          </DetailCard>

          <DetailCard title="Report" headingId="feedback-report">
            <div className="py-3">
              <pre
                className="overflow-x-auto rounded-md bg-surface-2 px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-muted"
                data-testid="feedback-report-raw"
              >
                {[
                  `Source: ${feedbackSourceLabel(item)}`,
                  `Provider: ${item.provider ?? "—"}`,
                  `Type: ${feedbackTypeLabel(item)}`,
                  `Received: ${item.created_at}`,
                ].join("\n")}
              </pre>
            </div>
          </DetailCard>

          <DetailCard
            title="Recipient history"
            headingId="feedback-recipient-history"
          >
            <MetaRow label="Messages">—</MetaRow>
            <MetaRow label="Opens">—</MetaRow>
            <MetaRow label="Earlier complaints">—</MetaRow>
            <MetaRow label="Signed up">—</MetaRow>
          </DetailCard>
        </div>

        <aside
          className={cn(feedbackDecisionPanelClass, "h-fit lg:sticky lg:top-6")}
        >
          <h2 className="text-[16px] font-semibold tracking-tight text-fg">
            Decision
          </h2>

          {!canWrite ? (
            <p className="text-[14px] text-fg-muted">
              Viewer role can inspect feedback but cannot claim or decide.
            </p>
          ) : item.status === "resolved" ? (
            <p className="text-[14px] text-fg-muted">
              Resolved as {feedbackDecisionLabel(item.decision)}
              {item.classification_label
                ? ` · ${item.classification_label}`
                : ""}
              .
            </p>
          ) : !claimedByYou ? (
            <div className="space-y-4">
              <p className="text-[14px] text-fg-muted">
                Claim this item to classify it and choose an outcome. Claims
                expire after 30 minutes.
              </p>
              <button
                type="button"
                className={feedbackPrimaryControl("w-full")}
                data-testid="feedback-claim"
                disabled={claimMutation.isPending}
                onClick={() => claimMutation.mutate()}
              >
                {claimMutation.isPending ? "Claiming…" : "Claim for review"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <Select
                value={classificationId || undefined}
                onValueChange={(value) =>
                  setClassificationOverride(value ?? undefined)
                }
                disabled={decideMutation.isPending}
              >
                <SelectTrigger
                  id="feedback-classification"
                  aria-label="Classification"
                  className={feedbackSelectTriggerClass}
                  data-testid="feedback-classification"
                >
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent className={feedbackSelectContentClass}>
                  {(classifications.data?.data ?? []).map((row) => (
                    <SelectItem
                      key={row.id}
                      value={row.id}
                      className={feedbackSelectItemClass}
                    >
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classifications.data?.data.length === 0 ? (
                <p className="text-[12px] text-fg-muted">
                  No active classifications in the catalog yet.
                </p>
              ) : null}

              <fieldset className="space-y-2.5">
                <legend className="sr-only">Action</legend>
                {DECISIONS.map((option) => {
                  const selected = decision === option.value
                  return (
                    <label
                      key={option.value}
                      className={feedbackDecisionOptionClass(selected)}
                    >
                      <input
                        type="radio"
                        name="feedback-decision"
                        value={option.value}
                        checked={selected}
                        onChange={() => setDecision(option.value)}
                        className="mt-1 size-4 accent-[var(--accent)]"
                        data-testid={`feedback-decision-${option.value}`}
                      />
                      <span>
                        <span className="block text-[14px] font-semibold text-fg">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-fg-muted">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              <div className="space-y-2">
                <label
                  htmlFor="feedback-note"
                  className="text-[13px] font-medium text-fg"
                >
                  Note
                </label>
                <textarea
                  id="feedback-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Optional operator note"
                  data-testid="feedback-note"
                  className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-[14px] text-fg shadow-none outline-none placeholder:text-fg-subtle focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:opacity-50"
                  disabled={decideMutation.isPending}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className={feedbackOutlineControl()}
                  data-testid="feedback-release"
                  onClick={() => router.push("/feedback")}
                >
                  Release
                </button>
                <button
                  type="button"
                  className={feedbackPrimaryControl()}
                  data-testid="feedback-save-decision"
                  disabled={
                    decideMutation.isPending || !classificationId || !canDecide
                  }
                  onClick={() => decideMutation.mutate()}
                >
                  {decideMutation.isPending ? "Saving…" : "Save decision"}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
