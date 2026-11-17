"use client"

import { Download, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useOfferSelection } from "@/components/app/offer-provider"
import { PageHeader } from "@/components/app/page-header"
import { recipientsColumns } from "@/features/recipients/recipients-columns"
import {
  RecipientsStatusChips,
  type RecipientStatusChipValue,
} from "@/features/recipients/recipients-status-chips"
import { RecipientsTabs } from "@/features/recipients/recipients-tabs"
import { recipientsOutlineControl } from "@/features/recipients/recipients-ui"
import { isValidEmailQuery } from "@/features/recipients/labels"
import { useRecipientsList } from "@/features/recipients/use-recipients-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"

const FILTER_KEYS = ["status", "email"] as const

function parseStatusChip(value: string | undefined): RecipientStatusChipValue {
  if (value === "active" || value === "bounced") {
    return value
  }
  return "all"
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
      status: selectedStatus === "all" ? undefined : selectedStatus,
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
                "last_emailed_at",
              ]
              const lines = [
                header.join(","),
                ...rows.map((row) =>
                  [
                    row.id,
                    row.email,
                    row.status,
                    row.tier,
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
            Download as CSV
          </button>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <RecipientsTabs active="list" />
        <div className="flex flex-wrap items-center gap-3">
          <RecipientsStatusChips
            value={selectedStatus}
            onChange={(value) => {
              tableState.setFilter(
                "status",
                value === "all" ? undefined : value
              )
            }}
          />
          <label className="relative block min-w-[14rem] flex-1 sm:max-w-xs">
            <span className="sr-only">Search email</span>
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
              placeholder="Search email"
              className="h-9 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)]"
              data-testid="recipients-search"
            />
          </label>
        </div>
      </div>

      {emailQuery && !emailFilter ? (
        <p
          className="text-sm text-fg-muted"
          data-testid="recipients-search-hint"
        >
          Enter a full email address to search.
        </p>
      ) : null}

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
        equalColumnWidths
        animateRows
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
  )
}
