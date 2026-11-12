"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import {
  claimFeedback,
  decideFeedback,
  fetchFeedback,
  fetchFeedbackClassifications,
  type FeedbackDecisionValue,
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
  feedbackOutlineControl,
  feedbackPrimaryControl,
  feedbackSectionClass,
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
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-[14px] text-fg">{children}</dd>
    </div>
  )
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
        {feedbackSourceLabel(item)} · {feedbackTypeLabel(item).toLowerCase()} ·
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

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Feedback", href: "/feedback" },
          { label: shortFeedbackId(item.id) },
        ]}
        title={shortFeedbackId(item.id)}
        titleBadge={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={feedbackStatusToBadge(item.status)} />
            {item.status === "in_review" && claimedByYou ? (
              <span className="text-[14px] text-fg-muted">· you</span>
            ) : null}
            {item.status === "resolved" ? (
              <span className="text-[14px] text-fg-muted">
                · {feedbackDecisionLabel(item.decision)}
              </span>
            ) : null}
          </span>
        }
        meta={subtitle}
        actions={
          item.status === "in_review" && claimedByYou && claimMs != null ? (
            <p
              className="text-[13px] text-fg-muted"
              data-testid="feedback-claim-expiry"
            >
              Your claim expires in {formatClaimRemaining(claimMs)}
            </p>
          ) : undefined
        }
      />

      {suppressNotice ? (
        <aside
          className="rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-[14px] text-fg"
          data-testid="feedback-suppress-notice"
          role="status"
        >
          Global complaint suppression created for{" "}
          <span className="font-mono">{item.email ?? "recipient"}</span>
          {" · "}
          <Link href="/suppression" className="underline underline-offset-2">
            Open suppression
          </Link>
        </aside>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section
            className={feedbackSectionClass}
            aria-labelledby="feedback-message"
          >
            <h2
              id="feedback-message"
              className="text-base font-semibold text-fg"
            >
              Message
            </h2>
            <dl className="space-y-3">
              <MetaRow label="Recipient">
                {item.email ? (
                  <span className="font-mono">{item.email}</span>
                ) : (
                  "—"
                )}
                {item.recipient_id ? (
                  <>
                    {" "}
                    <Link
                      href={`/recipients?q=${encodeURIComponent(item.recipient_id)}`}
                      className="font-mono text-[12px] text-fg-muted underline-offset-2 hover:underline"
                    >
                      {item.recipient_id.slice(0, 8)}
                    </Link>
                  </>
                ) : null}
              </MetaRow>
              <MetaRow label="Message id">
                {item.message_id ? (
                  <span className="font-mono text-[13px]">
                    {item.message_id}
                  </span>
                ) : (
                  "—"
                )}
              </MetaRow>
              <MetaRow label="Type">{feedbackTypeLabel(item)}</MetaRow>
            </dl>
          </section>

          <section
            className={feedbackSectionClass}
            aria-labelledby="feedback-report"
          >
            <h2
              id="feedback-report"
              className="text-base font-semibold text-fg"
            >
              Report
            </h2>
            <dl className="space-y-3 font-mono text-[13px]">
              <MetaRow label="Source">{feedbackSourceLabel(item)}</MetaRow>
              <MetaRow label="Provider">{item.provider ?? "—"}</MetaRow>
              <MetaRow label="Received">
                <EtDateTime value={item.created_at} />
              </MetaRow>
            </dl>
            <p className="text-[13px] text-fg-muted">
              Parsed FBL headers appear here when the IMAP intake job attaches a
              provider report.
            </p>
          </section>

          <section
            className={feedbackSectionClass}
            aria-labelledby="feedback-recipient-history"
          >
            <h2
              id="feedback-recipient-history"
              className="text-base font-semibold text-fg"
            >
              Recipient
            </h2>
            <dl className="space-y-3">
              <MetaRow label="Email">
                {item.email ? (
                  <span className="font-mono">{item.email}</span>
                ) : (
                  "—"
                )}
              </MetaRow>
              <MetaRow label="Recipient id">
                {item.recipient_id ? (
                  <span className="font-mono text-[13px]">
                    {item.recipient_id}
                  </span>
                ) : (
                  "—"
                )}
              </MetaRow>
            </dl>
          </section>
        </div>

        <aside className={cn(feedbackSectionClass, "h-fit lg:sticky lg:top-6")}>
          <h2 className="text-base font-semibold text-fg">Decision</h2>

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
              <div className="space-y-2">
                <label
                  htmlFor="feedback-classification"
                  className="text-[13px] font-medium text-fg"
                >
                  Classification
                </label>
                <Select
                  value={classificationId || undefined}
                  onValueChange={(value) =>
                    setClassificationOverride(value ?? undefined)
                  }
                  disabled={decideMutation.isPending}
                >
                  <SelectTrigger
                    id="feedback-classification"
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
              </div>

              <fieldset className="space-y-3">
                <legend className="text-[13px] font-medium text-fg">
                  Action
                </legend>
                {DECISIONS.map((option) => {
                  const selected = decision === option.value
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border p-3",
                        selected
                          ? "border-fg bg-surface-2"
                          : "border-border hover:bg-surface-2/60"
                      )}
                    >
                      <input
                        type="radio"
                        name="feedback-decision"
                        value={option.value}
                        checked={selected}
                        onChange={() => setDecision(option.value)}
                        className="mt-1"
                        data-testid={`feedback-decision-${option.value}`}
                      />
                      <span>
                        <span className="block text-[14px] font-medium text-fg">
                          {option.label}
                        </span>
                        <span className="block text-[13px] text-fg-muted">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              <div className="flex flex-wrap gap-2">
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
