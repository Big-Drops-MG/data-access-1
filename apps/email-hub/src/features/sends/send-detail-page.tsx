"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import {
  cancelSend,
  deleteSend,
  fetchSend,
  type SendCounts,
  type SendListItem,
} from "@/features/sends/api"
import { SendLockedDialog } from "@/features/sends/send-locked-dialog"
import {
  canCancelSend,
  isSendLive,
  sendOfferLabel,
  sendProgressPercent,
  sendStatusToBadge,
  shortSendId,
} from "@/features/sends/send-status"
import {
  sendsDestructiveControl,
  sendsOutlineControl,
  sendsPrimaryControl,
  sendsSectionClass,
} from "@/features/sends/sends-ui"
import { isApiError } from "@/lib/api-client"
import { detailQueryKey, listQueryKey } from "@/lib/query-keys"
import { detailQueryOptions } from "@/lib/query-options"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const POLL_INTERVAL_MS = 5000
const headingClass = "text-base font-semibold tracking-tight text-fg"

type SendDetailPageProps = {
  sendId: string
  canWrite?: boolean
}

type OutcomeRow = {
  key: string
  label: string
  value: number
  nested?: boolean
}

function outcomeRows(counts: SendCounts): OutcomeRow[] {
  return [
    { key: "delivered", label: "Delivered", value: counts.delivered },
    { key: "sent", label: "Sent", value: counts.sent },
    { key: "queued", label: "Queued", value: counts.queued },
    { key: "soft_bounce", label: "Soft bounce", value: counts.soft_bounce },
    { key: "hard_bounce", label: "Hard bounce", value: counts.hard_bounce },
    { key: "skipped", label: "Skipped", value: counts.skipped },
    {
      key: "skipped_suppressed",
      label: "Suppressed",
      value: counts.skipped_suppressed,
      nested: true,
    },
    {
      key: "skipped_opted_out",
      label: "Opted out",
      value: counts.skipped_opted_out,
      nested: true,
    },
    {
      key: "skipped_frequency_cap",
      label: "Frequency cap",
      value: counts.skipped_frequency_cap,
      nested: true,
    },
  ]
}

function formatShare(value: number, total: number): string {
  if (total <= 0) {
    return "—"
  }
  return `${((value / total) * 100).toFixed(1)}%`
}

function SendMeta({ send }: { send: SendListItem }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-[12px]">{shortSendId(send.id)}</span>
      <span aria-hidden>·</span>
      <span>
        {send.template_name ?? "Template"}
        {send.template_version_no != null
          ? ` v${send.template_version_no}`
          : ""}
      </span>
      <span aria-hidden>·</span>
      <span>{send.sender_from_email ?? "Unknown sender"}</span>
      <span aria-hidden>·</span>
      <span>{send.category_name ?? "Category"}</span>
      <span aria-hidden>·</span>
      <span>Offer: {sendOfferLabel(send)}</span>
      <span aria-hidden>·</span>
      <EtDateTime
        value={send.scheduled_for}
        className="text-body text-fg-muted"
      />
    </span>
  )
}

export function SendDetailPage({
  sendId,
  canWrite = false,
}: SendDetailPageProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [lockedOpen, setLockedOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const sendQuery = useQuery({
    ...detailQueryOptions("sends", sendId, () => fetchSend(sendId)),
    refetchInterval: (query) =>
      query.state.data && isSendLive(query.state.data.status)
        ? POLL_INTERVAL_MS
        : false,
  })
  const send = sendQuery.data

  const cancel = useMutation({
    mutationFn: (input: { version: number }) =>
      cancelSend(sendId, input.version),
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [
        listQueryKey("sends"),
        detailQueryKey("sends", sendId),
      ],
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey("sends") })
      await queryClient.invalidateQueries({
        queryKey: detailQueryKey("sends", sendId),
      })
      toast.success("Send cancelled")
    },
    onError: (error) => {
      void queryClient.invalidateQueries({
        queryKey: detailQueryKey("sends", sendId),
      })
      toast.error(
        isApiError(error) && error.status === 409
          ? "This send changed state and could not be cancelled."
          : isApiError(error)
            ? error.message
            : "Could not cancel send"
      )
    },
  })

  const remove = useMutation({
    mutationFn: (input: { version: number }) =>
      deleteSend(sendId, input.version),
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [
        listQueryKey("sends"),
        detailQueryKey("sends", sendId),
      ],
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey("sends") })
      toast.success("Draft deleted")
      router.push("/sends")
    },
    onError: (error) => {
      void queryClient.invalidateQueries({
        queryKey: detailQueryKey("sends", sendId),
      })
      toast.error(
        isApiError(error) && error.status === 409
          ? "Only draft sends with no messages can be deleted."
          : isApiError(error)
            ? error.message
            : "Could not delete draft"
      )
    },
  })

  if (sendQuery.isError && !send) {
    return (
      <div className="space-y-6" data-testid="send-detail-page">
        <PageHeader
          title="Send"
          breadcrumbs={[{ label: "Sends", href: "/sends" }, { label: "Send" }]}
        />
        <InlineErrorCard
          message={
            isApiError(sendQuery.error)
              ? sendQuery.error.message
              : "Could not load send."
          }
          requestId={
            isApiError(sendQuery.error) ? sendQuery.error.requestId : null
          }
          onRetry={() => {
            void sendQuery.refetch()
          }}
        />
      </div>
    )
  }

  if (!send) {
    return (
      <div className="space-y-6" data-testid="send-detail-page">
        <PageHeader
          title="Send"
          breadcrumbs={[{ label: "Sends", href: "/sends" }, { label: "Send" }]}
        />
        <div
          className="h-64 animate-pulse rounded-xl bg-surface-2"
          data-testid="send-detail-loading"
          aria-hidden
        />
      </div>
    )
  }

  const live = isSendLive(send.status)
  const percent = sendProgressPercent(send.counts)
  const started =
    send.status !== "draft" &&
    send.status !== "scheduled" &&
    (send.dispatch_started_at != null || send.counts.total > 0)

  return (
    <div className="space-y-8" data-testid="send-detail-page">
      <PageHeader
        title={send.name}
        titleBadge={<StatusBadge status={sendStatusToBadge(send.status)} />}
        meta={<SendMeta send={send} />}
        breadcrumbs={[{ label: "Sends", href: "/sends" }, { label: send.name }]}
        actions={
          canWrite ? (
            <>
              {send.status === "draft" ? (
                <Link
                  href={`/sends/${encodeURIComponent(send.id)}/edit`}
                  className={sendsOutlineControl()}
                  data-testid="send-edit"
                >
                  Edit
                </Link>
              ) : (
                <button
                  type="button"
                  className={sendsOutlineControl()}
                  onClick={() => setLockedOpen(true)}
                  data-testid="send-edit"
                >
                  Edit
                </button>
              )}
              {send.status === "draft" ? (
                <button
                  type="button"
                  className={sendsDestructiveControl()}
                  disabled={remove.isPending}
                  onClick={() => setDeleteOpen(true)}
                  data-testid="send-delete-draft"
                >
                  Delete draft
                </button>
              ) : null}
              {canCancelSend(send.status) ? (
                <button
                  type="button"
                  className={sendsPrimaryControl()}
                  disabled={cancel.isPending}
                  onClick={() => setCancelOpen(true)}
                  data-testid="send-cancel"
                >
                  Cancel send
                </button>
              ) : null}
            </>
          ) : undefined
        }
      />

      {sendQuery.isError ? (
        <InlineErrorCard
          message="Could not refresh this send."
          requestId={
            isApiError(sendQuery.error) ? sendQuery.error.requestId : null
          }
          onRetry={() => {
            void sendQuery.refetch()
          }}
        />
      ) : null}

      <section
        className={sendsSectionClass}
        aria-labelledby="send-progress-heading"
        data-testid="send-progress"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="send-progress-heading" className={headingClass}>
            Progress
          </h2>
          {live ? (
            <p
              className="text-caption text-fg-muted"
              role="status"
              data-testid="send-refreshing"
            >
              Refreshing every 5 s
            </p>
          ) : null}
        </div>
        {started ? (
          <>
            <div
              role="progressbar"
              aria-label="Messages processed"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-fg transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-sm text-fg-muted tabular-nums">
              {send.counts.processed.toLocaleString("en-US")} of{" "}
              {send.counts.total.toLocaleString("en-US")} processed ({percent}%)
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">
            {send.status === "cancelled"
              ? "Cancelled before it started."
              : "Recipients are counted when dispatch starts."}
          </p>
        )}
      </section>

      <section
        className={sendsSectionClass}
        aria-labelledby="send-outcomes-heading"
        data-testid="send-outcomes"
      >
        <h2 id="send-outcomes-heading" className={headingClass}>
          Outcomes
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Outcome</TableHead>
              <TableHead scope="col" className="text-right">
                Messages
              </TableHead>
              <TableHead scope="col" className="text-right">
                Share
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outcomeRows(send.counts).map((row) => (
              <TableRow key={row.key} data-testid={`send-outcome-${row.key}`}>
                <TableCell
                  className={row.nested ? "pl-8 text-fg-muted" : "text-fg"}
                >
                  {row.label}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.value.toLocaleString("en-US")}
                </TableCell>
                <TableCell className="text-right text-fg-muted tabular-nums">
                  {formatShare(row.value, send.counts.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section
        className={sendsSectionClass}
        aria-labelledby="send-activity-heading"
        data-testid="send-activity"
      >
        <h2 id="send-activity-heading" className={headingClass}>
          Activity
        </h2>
        {send.activity.length === 0 ? (
          <p className="text-sm text-fg-muted">No activity yet.</p>
        ) : (
          <ol className="space-y-4 border-l border-border pl-5">
            {send.activity.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="relative space-y-0.5">
                <span
                  className="absolute top-1.5 -left-[1.6rem] size-2 rounded-full bg-fg"
                  aria-hidden
                />
                <p className="text-sm font-medium text-fg">{entry.label}</p>
                {entry.detail ? (
                  <p className="text-caption text-fg-muted">{entry.detail}</p>
                ) : null}
                <EtDateTime
                  value={entry.at}
                  className="text-caption text-fg-muted"
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this send?"
        description={
          send.status === "dispatching"
            ? "Messages already handed off stay sent. Remaining recipients will not receive this send."
            : "This send will not go out. You can create a new send afterwards."
        }
        confirmLabel="Cancel send"
        cancelLabel="Keep send"
        destructive
        onConfirm={() => cancel.mutate({ version: send.version })}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this draft?"
        description="This removes the draft permanently. Scheduled and started sends cannot be deleted."
        confirmLabel="Delete draft"
        cancelLabel="Keep draft"
        confirmPhrase={send.name}
        destructive
        onConfirm={() => remove.mutate({ version: send.version })}
      />

      <SendLockedDialog open={lockedOpen} onOpenChange={setLockedOpen} />
    </div>
  )
}
