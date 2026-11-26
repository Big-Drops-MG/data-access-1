"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useOfferSelection } from "@/components/app/offer-provider"
import { PageHeader } from "@/components/app/page-header"
import type { FeedbackStatus } from "@/features/feedback/api"
import { feedbackResponseColumns } from "@/features/feedback/feedback-responses-columns"
import {
  isStalePending,
  parseFeedbackStatusTab,
  type FeedbackStatusTabValue,
} from "@/features/feedback/feedback-status"
import { FeedbackStatusTabs } from "@/features/feedback/feedback-status-tabs"
import { useFeedbackList } from "@/features/feedback/use-feedback-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"

const FILTER_KEYS = ["status"] as const

type FeedbackResponsesPageProps = {
  currentUserId?: string | null
}

export function FeedbackResponsesPage({
  currentUserId = null,
}: FeedbackResponsesPageProps) {
  const router = useRouter()
  const { selectedOfferId } = useOfferSelection()
  const tableState = useDataTableUrlState({ filterKeys: FILTER_KEYS })
  const selectedStatus = parseFeedbackStatusTab(tableState.filters.status)

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      source: "feedback_form" as const,
      status:
        selectedStatus === "all"
          ? undefined
          : (selectedStatus as FeedbackStatus),
      offer_id: selectedOfferId ?? undefined,
    }),
    [selectedOfferId, selectedStatus, tableState.cursor, tableState.limit]
  )

  const list = useFeedbackList(listParams)
  const allForCounts = useFeedbackList({
    limit: 200,
    source: "feedback_form",
    offer_id: selectedOfferId ?? undefined,
  })

  const counts = useMemo(() => {
    const rows = allForCounts.data?.data ?? []
    const next: Partial<Record<FeedbackStatusTabValue, number>> = {
      all: rows.length,
      pending: 0,
      in_review: 0,
      resolved: 0,
    }
    for (const row of rows) {
      const key = row.status as FeedbackStatusTabValue
      if (key in next) {
        next[key] = (next[key] ?? 0) + 1
      }
    }
    return next
  }, [allForCounts.data?.data])

  const stalePendingCount = useMemo(
    () =>
      (allForCounts.data?.data ?? []).filter((row) => isStalePending(row))
        .length,
    [allForCounts.data?.data]
  )

  const columns = useMemo(
    () => feedbackResponseColumns(currentUserId),
    [currentUserId]
  )

  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  return (
    <section className="space-y-6" aria-label="Feedback responses">
      <PageHeader
        title="Feedback"
        description="User responses submitted from feedback forms. Review, classify, and decide on each response."
      />

      {stalePendingCount > 0 ? (
        <aside
          className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-[14px] text-fg"
          data-testid="feedback-responses-stale-banner"
          role="status"
        >
          {stalePendingCount} feedback response
          {stalePendingCount === 1 ? " has" : "s have"} waited more than 48
          hours. Open the oldest one first.
        </aside>
      ) : null}

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load feedback responses."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="feedback-responses"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        nextCursor={nextCursor}
        pageSize={tableState.limit}
        onPageSizeChange={tableState.setLimit}
        onNextPage={tableState.goNext}
        onPreviousPage={tableState.goPrevious}
        canPreviousPage={tableState.canGoPrevious}
        isLoading={list.isPending && !list.data}
        showColumnToggle={false}
        equalColumnWidths
        animateRows
        testIdPrefix="feedback-responses"
        empty={
          <p
            className="text-sm text-fg-muted"
            data-testid="feedback-responses-empty"
          >
            No user feedback responses yet. Responses submitted from feedback
            forms will appear here.
          </p>
        }
        onRowClick={(row) => {
          router.push(`/feedback/${encodeURIComponent(row.id)}`)
        }}
        toolbar={
          <FeedbackStatusTabs
            value={selectedStatus}
            counts={counts}
            onChange={(value) => {
              tableState.setFilter(
                "status",
                value === "pending" ? undefined : value
              )
            }}
          />
        }
      />
    </section>
  )
}
