"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import type { SendStatus } from "@/features/sends/api"
import {
  parseSendStatusTab,
  type SendStatusTabValue,
} from "@/features/sends/send-status"
import { SendStatusTabs } from "@/features/sends/send-status-tabs"
import { sendsColumns } from "@/features/sends/sends-columns"
import { sendsPrimaryControl } from "@/features/sends/sends-ui"
import { useSendsList } from "@/features/sends/use-sends-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"

const SEND_FILTER_KEYS = ["status"] as const

type SendsPageProps = {
  canWrite?: boolean
}

export function SendsPage({ canWrite = false }: SendsPageProps) {
  const router = useRouter()
  const tableState = useDataTableUrlState({ filterKeys: SEND_FILTER_KEYS })
  const selectedStatus = parseSendStatusTab(tableState.filters.status)

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      status:
        selectedStatus === "all" ? undefined : (selectedStatus as SendStatus),
    }),
    [selectedStatus, tableState.cursor, tableState.limit]
  )

  const list = useSendsList(listParams)
  const allForCounts = useSendsList({ limit: 100 })

  const counts = useMemo(() => {
    const rows = allForCounts.data?.data ?? []
    const next: Partial<Record<SendStatusTabValue, number>> = {
      all: rows.length,
      draft: 0,
      scheduled: 0,
      queued: 0,
      dispatching: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
    }
    for (const row of rows) {
      const key = row.status as SendStatusTabValue
      if (key in next) {
        next[key] = (next[key] ?? 0) + 1
      }
    }
    return next
  }, [allForCounts.data?.data])

  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sends"
        description="Scheduled and past campaign sends. Times are shown in Eastern Time."
        actions={
          canWrite ? (
            <Link
              href="/sends/new"
              className={sendsPrimaryControl()}
              data-testid="sends-add"
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              New send
            </Link>
          ) : undefined
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load sends."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="sends"
        columns={sendsColumns}
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
          router.push(`/sends/${encodeURIComponent(row.id)}`)
        }}
        testIdPrefix="sends"
        toolbar={
          <SendStatusTabs
            value={selectedStatus}
            counts={counts}
            onChange={(value) => {
              tableState.setFilter(
                "status",
                value === "all" ? undefined : value
              )
            }}
          />
        }
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="sends-empty"
          >
            No sends in this view.
          </p>
        }
      />
    </div>
  )
}
