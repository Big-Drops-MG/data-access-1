"use client"

import { useMemo, useState } from "react"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { optOutColumns } from "@/features/unsubscribe-admin/opt-out-columns"
import { UnsubscribeSettingsPanel } from "@/features/unsubscribe-admin/unsubscribe-settings-panel"
import {
  parseUnsubscribeView,
  type UnsubscribeView,
} from "@/features/unsubscribe-admin/unsubscribe-view"
import { UnsubscribeViewTabs } from "@/features/unsubscribe-admin/unsubscribe-view-tabs"
import { useUnsubscribeOptOuts } from "@/features/unsubscribe-admin/use-unsubscribe-opt-outs"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { cn } from "@workspace/ui/lib/utils"

const FILTER_KEYS = ["view", "scope", "q"] as const

type ScopeFilter = "category" | "all" | "all_types"

function parseScope(value: string | null | undefined): ScopeFilter {
  if (value === "category" || value === "all") {
    return value
  }
  return "all_types"
}

export function UnsubscribeAdminPage() {
  const tableState = useDataTableUrlState({ filterKeys: FILTER_KEYS })
  const selectedView = parseUnsubscribeView(tableState.filters.view)
  const selectedScope = parseScope(tableState.filters.scope)
  const [searchDraft, setSearchDraft] = useState(tableState.filters.q ?? "")

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      q: tableState.filters.q || undefined,
      scope: selectedScope,
    }),
    [selectedScope, tableState.cursor, tableState.filters.q, tableState.limit]
  )

  const list = useUnsubscribeOptOuts(listParams)
  const columns = useMemo(() => optOutColumns(), [])
  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  function setView(view: UnsubscribeView) {
    tableState.setFilter("view", view === "list" ? undefined : view)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unsubscribe"
        description="Hub thank-you and feedback opt-outs, plus public page branding and custom domain."
      />

      <UnsubscribeViewTabs value={selectedView} onChange={setView} />

      {selectedView === "settings" ? <UnsubscribeSettingsPanel /> : null}

      {selectedView === "list" ? (
        <>
          {list.isError ? (
            <InlineErrorCard
              message={
                isApiError(list.error)
                  ? list.error.message
                  : "Could not load opt-outs."
              }
              requestId={isApiError(list.error) ? list.error.requestId : null}
              onRetry={() => {
                void list.refetch()
              }}
            />
          ) : null}

          <DataTable
            storageKey="unsubscribe-opt-outs"
            columns={columns}
            data={rows}
            getRowId={(row) => `${row.kind}:${row.id}`}
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
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2">
                <form
                  className="flex min-w-[14rem] flex-1 gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    tableState.setFilter(
                      "q",
                      searchDraft.trim() === "" ? undefined : searchDraft.trim()
                    )
                  }}
                >
                  <input
                    type="search"
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder="Search email"
                    className={cn(
                      "h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-[13px] text-fg outline-none",
                      "focus-visible:shadow-[0_0_0_3px_var(--ring)]"
                    )}
                    data-testid="unsubscribe-opt-out-search"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-fg hover:bg-surface-2"
                  >
                    Search
                  </button>
                </form>
                <label className="flex items-center gap-2 text-[13px] text-fg-muted">
                  Scope
                  <select
                    value={selectedScope}
                    onChange={(event) => {
                      const value = event.target.value as ScopeFilter
                      tableState.setFilter(
                        "scope",
                        value === "all_types" ? undefined : value
                      )
                    }}
                    className="h-9 rounded-md border border-border bg-bg px-2 text-[13px] text-fg outline-none"
                    data-testid="unsubscribe-opt-out-scope"
                  >
                    <option value="all_types">All types</option>
                    <option value="category">Category only</option>
                    <option value="all">All relationship</option>
                  </select>
                </label>
              </div>
            }
          />
        </>
      ) : null}
    </div>
  )
}
