"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import type { EmailType } from "@/features/templates/api"
import {
  TemplateTypeTabs,
  type TemplateTypeTabValue,
} from "@/features/templates/template-type-tabs"
import { templatesColumns } from "@/features/templates/templates-columns"
import { templatesPrimaryControl } from "@/features/templates/templates-ui"
import { useTemplatesList } from "@/features/templates/use-templates-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"

const TEMPLATE_FILTER_KEYS = ["email_type"] as const

type TemplatesPageProps = {
  canWrite?: boolean
}

function parseTypeTab(value: string | undefined): TemplateTypeTabValue {
  if (
    value === "thank_you" ||
    value === "feedback_request" ||
    value === "engagement"
  ) {
    return value
  }
  return "all"
}

export function TemplatesPage({ canWrite = false }: TemplatesPageProps) {
  const router = useRouter()
  const tableState = useDataTableUrlState({ filterKeys: TEMPLATE_FILTER_KEYS })
  const selectedType = parseTypeTab(tableState.filters.email_type)

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      email_type:
        selectedType === "all" ? undefined : (selectedType as EmailType),
    }),
    [selectedType, tableState.cursor, tableState.limit]
  )

  const list = useTemplatesList(listParams)
  const allForCounts = useTemplatesList({ limit: 100 })

  const counts = useMemo(() => {
    const rows = allForCounts.data?.data ?? []
    const next: Partial<Record<TemplateTypeTabValue, number>> = {
      all: rows.length,
      thank_you: 0,
      feedback_request: 0,
      engagement: 0,
    }
    for (const row of rows) {
      next[row.email_type] = (next[row.email_type] ?? 0) + 1
    }
    return next
  }, [allForCounts.data?.data])

  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        actions={
          canWrite ? (
            <Link
              href="/templates/new"
              className={templatesPrimaryControl()}
              data-testid="templates-add"
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              New template
            </Link>
          ) : undefined
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load templates."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="templates"
        columns={templatesColumns}
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
          router.push(`/templates/${encodeURIComponent(row.id)}`)
        }}
        testIdPrefix="templates"
        toolbar={
          <TemplateTypeTabs
            value={selectedType}
            counts={counts}
            onChange={(value) => {
              tableState.setFilter(
                "email_type",
                value === "all" ? undefined : value
              )
            }}
          />
        }
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="templates-empty"
          >
            No templates in this view.
          </p>
        }
      />
    </div>
  )
}
