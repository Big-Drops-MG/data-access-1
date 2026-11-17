"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { useOfferSelection } from "@/components/app/offer-provider"
import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import type { FeedbackStatus } from "@/features/feedback/api"
import { DomainsReputationPage } from "@/features/feedback/domains-reputation-page"
import { feedbackColumns } from "@/features/feedback/feedback-columns"
import {
  isStalePending,
  parseFeedbackStatusTab,
  type FeedbackStatusTabValue,
} from "@/features/feedback/feedback-status"
import { FeedbackStatusTabs } from "@/features/feedback/feedback-status-tabs"
import {
  parseComplaintsView,
  type ComplaintsView,
} from "@/features/feedback/feedback-view"
import { FeedbackViewTabs } from "@/features/feedback/feedback-view-tabs"
import { useFeedbackList } from "@/features/feedback/use-feedback-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"

const FILTER_KEYS = ["status", "view"] as const

type FeedbackPageProps = {
  currentUserId?: string | null
}

export function FeedbackPage({ currentUserId = null }: FeedbackPageProps) {
  const router = useRouter()
  const { selectedOfferId } = useOfferSelection()
  const tableState = useDataTableUrlState({ filterKeys: FILTER_KEYS })
  const selectedView = parseComplaintsView(tableState.filters.view)
  const selectedStatus = parseFeedbackStatusTab(tableState.filters.status)

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
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

  const columns = useMemo(() => feedbackColumns(currentUserId), [currentUserId])

  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  function setView(view: ComplaintsView) {
    tableState.setFilter("view", view === "users" ? undefined : view)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints"
        description="Domain reputation and per-user junk reports. Nothing is suppressed until a person decides."
      />

      <FeedbackViewTabs value={selectedView} onChange={setView} />

      {selectedView === "domains" ? <DomainsReputationPage /> : null}

      {selectedView === "users" ? (
        <>
          {stalePendingCount > 0 ? (
            <aside
              className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-[14px] text-fg"
              data-testid="feedback-stale-banner"
              role="status"
            >
              {stalePendingCount} complaint
              {stalePendingCount === 1 ? " has" : "s have"} waited more than 48
              hours. Open the oldest one first.
            </aside>
          ) : null}

          {list.isError ? (
            <InlineErrorCard
              message={
                isApiError(list.error)
                  ? list.error.message
                  : "Could not load feedback."
              }
              requestId={isApiError(list.error) ? list.error.requestId : null}
              onRetry={() => {
                void list.refetch()
              }}
            />
          ) : null}

          <DataTable
            storageKey="feedback"
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
            onRowClick={(row) => {
              router.push(`/complaints/${encodeURIComponent(row.id)}`)
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
        </>
      ) : null}
    </div>
  )
}
