"use client"

import { useMutation } from "@tanstack/react-query"
import { Globe } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import { DataTable } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/empty-state"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { domainsColumns } from "@/features/domains/domains-columns"
import { fetchDomainsList, type DomainListItem } from "@/features/domains/api"
import { useDomainsList } from "@/features/domains/use-domains-list"
import { ApiError, isApiError } from "@/lib/api-client"
import {
  collectCursorPagesForExport,
  downloadCsv,
  rowsToCsv,
  DataTableExportTooLargeError,
} from "@/lib/data-table/csv"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { listQueryKey } from "@/lib/query-keys"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const DOMAIN_STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "verifying", label: "Verifying" },
  { value: "verified", label: "Verified" },
  { value: "failed", label: "Failed" },
  { value: "inactive", label: "Inactive" },
] as const

const DOMAIN_FILTER_KEYS = ["status"] as const

/**
 * Domains list using shared DataTable (T-055 / SD#12.5).
 * Conflict probe retained for T-050 global 409 UX.
 */
export function DomainsPage() {
  const router = useRouter()
  const [exporting, startExport] = useTransition()
  const [exportError, setExportError] = useState<string | null>(null)
  const tableState = useDataTableUrlState({ filterKeys: DOMAIN_FILTER_KEYS })

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      status: tableState.filters.status,
    }),
    [tableState.cursor, tableState.filters.status, tableState.limit]
  )

  const list = useDomainsList(listParams)

  const conflictProbe = useMutation({
    mutationFn: async () => {
      throw new ApiError("Conflict", 409, "conflict", "demo-req", [
        { path: "version", message: "Stale version" },
      ])
    },
    meta: {
      conflictInvalidateKeys: [listQueryKey("domains")],
    },
  })

  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  function handleExport() {
    setExportError(null)
    startExport(() => {
      void (async () => {
        try {
          const allRows = await collectCursorPagesForExport<DomainListItem>({
            fetchPage: ({ cursor, limit }) =>
              fetchDomainsList({
                limit,
                cursor,
                status: tableState.filters.status,
              }),
          })
          const csv = rowsToCsv(allRows, [
            { id: "name", header: "Domain", value: (row) => row.name },
            { id: "status", header: "Status", value: (row) => row.status },
            {
              id: "created_at",
              header: "Created",
              value: (row) => row.created_at ?? "",
            },
          ])
          downloadCsv("domains.csv", csv)
          setExportError(null)
        } catch (error) {
          const message =
            error instanceof DataTableExportTooLargeError
              ? error.message
              : isApiError(error)
                ? error.message
                : "Could not export domains."
          setExportError(message)
        }
      })()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domains"
        description="Sending domains for Email Hub."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => conflictProbe.mutate()}
            data-testid="domains-conflict-probe"
          >
            Simulate conflict
          </Button>
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load domains."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      {exportError ? (
        <InlineErrorCard
          message={exportError}
          onRetry={() => {
            handleExport()
          }}
        />
      ) : null}

      <DataTable
        storageKey="domains"
        columns={domainsColumns}
        data={rows}
        getRowId={(row) => row.id}
        nextCursor={nextCursor}
        pageSize={tableState.limit}
        onPageSizeChange={tableState.setLimit}
        onNextPage={tableState.goNext}
        onPreviousPage={tableState.goPrevious}
        canPreviousPage={tableState.canGoPrevious}
        isLoading={list.isPending}
        onRowClick={(row) => {
          router.push(`/domains/${row.id}`)
        }}
        onExportCsv={handleExport}
        exporting={exporting}
        testIdPrefix="domains"
        toolbar={
          <Select
            value={tableState.filters.status ?? "all"}
            onValueChange={(value) => {
              if (value == null || value === "all") {
                tableState.setFilter("status", undefined)
                return
              }
              tableState.setFilter("status", value)
            }}
          >
            <SelectTrigger
              size="sm"
              className="min-w-40"
              data-testid="domains-filter-status"
            >
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {DOMAIN_STATUS_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        emptyState={
          <EmptyState
            icon={<Globe strokeWidth={1.75} />}
            title="No domains yet"
            description="When you add a sending domain, it will show up here."
          />
        }
        rowActions={(row) => [
          {
            id: "open",
            label: "Open",
            onSelect: () => {
              router.push(`/domains/${row.id}`)
            },
          },
        ]}
      />
    </div>
  )
}
