"use client"

import { Download, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useOfferSelection } from "@/components/app/offer-provider"
import { PageHeader } from "@/components/app/page-header"
import { EMPTY_RECIPIENT_STATUS_COUNTS } from "@/features/recipients/api"
import {
  isValidEmailQuery,
  messageStatusLabel,
  recipientDisplayStatus,
  recipientStatusLabel,
} from "@/features/recipients/labels"
import { recipientsColumns } from "@/features/recipients/recipients-columns"
import {
  RecipientsStatusChips,
  type RecipientStatusChipValue,
} from "@/features/recipients/recipients-status-chips"
import { RecipientsTabs } from "@/features/recipients/recipients-tabs"
import { recipientsOutlineControl } from "@/features/recipients/recipients-ui"
import { useRecipientsList } from "@/features/recipients/use-recipients-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"

const FILTER_KEYS = ["status", "email"] as const
const numberFmt = new Intl.NumberFormat("en-US")

function parseStatusChip(value: string | undefined): RecipientStatusChipValue {
  if (value === "active" || value === "bounced" || value === "unsubscribed") {
    return value
  }
  return "all"
}

function rangeLabel(input: {
  rowCount: number
  pageIndex: number
  pageSize: number
  total: number
  offsetKnown: boolean
}): string {
  const totalLabel = numberFmt.format(input.total)
  if (input.rowCount === 0) {
    return `0 of ${totalLabel}`
  }
  if (!input.offsetKnown) {
    return `${numberFmt.format(input.rowCount)} of ${totalLabel}`
  }
  const start = input.pageIndex * input.pageSize + 1
  const end = start + input.rowCount - 1
  return `${numberFmt.format(start)}-${numberFmt.format(end)} of ${totalLabel}`
}

export function RecipientsPage() {
  const router = useRouter()
  const { selectedOfferId } = useOfferSelection()
  const tableState = useDataTableUrlState({ filterKeys: FILTER_KEYS })
  const selectedStatus = parseStatusChip(tableState.filters.status)
  const emailQuery = (tableState.filters.email ?? "").trim()
  const emailFilter = isValidEmailQuery(emailQuery) ? emailQuery : undefined

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      status:
        selectedStatus === "active" || selectedStatus === "bounced"
          ? selectedStatus
          : undefined,
      unsubscribed: selectedStatus === "unsubscribed" ? true : undefined,
      email: emailFilter,
      offer_id: selectedOfferId ?? undefined,
    }),
    [
      emailFilter,
      selectedOfferId,
      selectedStatus,
      tableState.cursor,
      tableState.limit,
    ]
  )

  const list = useRecipientsList(listParams)
  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null
  const statusCounts = useMemo(() => {
    const raw = list.data?.status_counts
    return {
      all: Number(raw?.all ?? EMPTY_RECIPIENT_STATUS_COUNTS.all),
      active: Number(raw?.active ?? EMPTY_RECIPIENT_STATUS_COUNTS.active),
      bounced: Number(raw?.bounced ?? EMPTY_RECIPIENT_STATUS_COUNTS.bounced),
      unsubscribed: Number(
        raw?.unsubscribed ?? EMPTY_RECIPIENT_STATUS_COUNTS.unsubscribed
      ),
    }
  }, [list.data?.status_counts])

  const summary = rangeLabel({
    rowCount: rows.length,
    pageIndex: tableState.pageIndex,
    pageSize: tableState.limit,
    total: statusCounts[selectedStatus],
    offsetKnown: tableState.pageIndex > 0 || !tableState.cursor,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipients"
        description="Everyone Email Hub has emailed or imported. Tier comes from Arohaa."
        actions={
          <button
            type="button"
            className={recipientsOutlineControl}
            data-testid="recipients-export"
            onClick={() => {
              const header = [
                "id",
                "email",
                "status",
                "tier",
                "offer",
                "last_message",
                "last_activity",
              ]
              const lines = [
                header.join(","),
                ...rows.map((row) =>
                  [
                    row.id,
                    row.email,
                    recipientStatusLabel(recipientDisplayStatus(row)),
                    row.tier,
                    row.offer?.external_ref ?? "",
                    row.last_message
                      ? messageStatusLabel(row.last_message.status)
                      : "",
                    row.last_emailed_at ?? "",
                  ]
                    .map((value) => `"${String(value).replaceAll('"', '""')}"`)
                    .join(",")
                ),
              ]
              const blob = new Blob([lines.join("\n")], {
                type: "text/csv;charset=utf-8",
              })
              const url = URL.createObjectURL(blob)
              const anchor = document.createElement("a")
              anchor.href = url
              anchor.download = "recipients.csv"
              anchor.click()
              URL.revokeObjectURL(url)
            }}
          >
            <Download className="size-3.5" strokeWidth={1.75} aria-hidden />
            Export CSV
          </button>
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load recipients."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border">
          <RecipientsTabs active="list" className="-mb-px border-0" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 pb-2">
            <RecipientsStatusChips
              value={selectedStatus}
              counts={statusCounts}
              onChange={(value) => {
                tableState.setFilter(
                  "status",
                  value === "all" ? undefined : value
                )
              }}
            />
            <label className="relative block w-full min-w-[12rem] sm:w-56">
              <span className="sr-only">Search recipients</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fg-muted"
                aria-hidden
              />
              <input
                type="search"
                value={tableState.filters.email ?? ""}
                onChange={(event) => {
                  tableState.setFilter(
                    "email",
                    event.target.value.trim() ? event.target.value : undefined
                  )
                }}
                placeholder="Search recipients"
                aria-invalid={Boolean(emailQuery && !emailFilter)}
                aria-describedby={
                  emailQuery && !emailFilter
                    ? "recipients-search-hint"
                    : undefined
                }
                className="h-8 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-[13px] text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)]"
                data-testid="recipients-search"
              />
            </label>
          </div>
        </div>

        {emailQuery && !emailFilter ? (
          <p
            id="recipients-search-hint"
            className="text-[13px] text-fg-muted"
            data-testid="recipients-search-hint"
          >
            Enter a full email address to search.
          </p>
        ) : null}

        <DataTable
          storageKey="recipients"
          columns={recipientsColumns}
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
          animateRows
          pageSummary={summary}
          onRowClick={(row) => {
            router.push(`/recipients/${encodeURIComponent(row.id)}`)
          }}
          testIdPrefix="recipients"
          emptyState={
            <p
              className="px-4 py-10 text-center text-body text-fg-muted"
              data-testid="recipients-empty"
            >
              No recipients match these filters.
            </p>
          }
        />
      </div>
    </div>
  )
}
