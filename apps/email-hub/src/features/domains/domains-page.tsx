"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { EMPTY_DOMAIN_STATUS_COUNTS } from "@/features/domains/api"
import { domainsColumns } from "@/features/domains/domains-columns"
import {
  DomainStatusChips,
  type DomainStatusChipValue,
} from "@/features/domains/domain-status-chips"
import { useDomainsList } from "@/features/domains/use-domains-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { domainsPrimaryControl } from "@/features/domains/domains-ui"

const DOMAIN_FILTER_KEYS = ["status"] as const

type DomainsPageProps = {
  /** Admin-only create (POST /api/domains). */
  canCreateDomain?: boolean
}

function parseStatusChip(value: string | undefined): DomainStatusChipValue {
  switch (value) {
    case "verified":
    case "pending":
    case "verifying":
    case "failed":
    case "inactive":
      return value
    default:
      return "all"
  }
}

/** Domains list using shared DataTable (T-055); create lives at /domains/new. */
export function DomainsPage({ canCreateDomain = false }: DomainsPageProps) {
  const router = useRouter()
  const tableState = useDataTableUrlState({ filterKeys: DOMAIN_FILTER_KEYS })
  const selectedStatus = parseStatusChip(tableState.filters.status)

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      status: selectedStatus === "all" ? undefined : selectedStatus,
    }),
    [selectedStatus, tableState.cursor, tableState.limit]
  )

  const list = useDomainsList(listParams)

  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null
  const statusCounts = list.data?.status_counts ?? EMPTY_DOMAIN_STATUS_COUNTS

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domains"
        description="Sending domains in Amazon SES and their DNS records in Cloudflare. Checked every 6 hours."
        actions={
          canCreateDomain ? (
            <Link
              href="/domains/new"
              className={domainsPrimaryControl()}
              data-testid="domains-add"
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              Add domain
            </Link>
          ) : undefined
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
        isLoading={list.isPending && !list.data}
        showColumnToggle={false}
        equalColumnWidths
        animateRows
        onRowClick={(row) => {
          router.push(`/domains/${row.id}`)
        }}
        testIdPrefix="domains"
        toolbar={
          <DomainStatusChips
            value={selectedStatus}
            counts={statusCounts}
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
            data-testid="domains-empty"
          >
            No domains yet.
          </p>
        }
      />
    </div>
  )
}
