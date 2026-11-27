"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { DataTable } from "@/components/app/data-table"
import { ModuleSectionNav } from "@/components/app/module-section-nav"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useOfferSelection } from "@/components/app/offer-provider"
import { PageHeader } from "@/components/app/page-header"
import {
  fetchActiveOffersForSuppression,
  isHardBounceRemoveConflict,
  removeSuppression,
  type SuppressionListItem,
} from "@/features/suppression/api"
import { AddSuppressionDialog } from "@/features/suppression/add-suppression-dialog"
import {
  suppressionColumns,
  type SuppressionRow,
} from "@/features/suppression/suppression-columns"
import {
  canRemoveSuppression,
  parseSuppressionSourceTab,
} from "@/features/suppression/suppression-source"
import { SuppressionSourceTabs } from "@/features/suppression/suppression-source-tabs"
import { suppressionPrimaryControl } from "@/features/suppression/suppression-ui"
import { useSuppressionsList } from "@/features/suppression/use-suppressions-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { listQueryKey } from "@/lib/query-keys"
import { listQueryOptions } from "@/lib/query-options"

const FILTER_KEYS = ["source", "q"] as const

type SuppressionPageProps = {
  canAdd?: boolean
  canRemove?: boolean
}

export function SuppressionPage({
  canAdd = false,
  canRemove = false,
}: SuppressionPageProps) {
  const queryClient = useQueryClient()
  const { selectedOfferId } = useOfferSelection()
  const tableState = useDataTableUrlState({ filterKeys: FILTER_KEYS })
  const selectedSource = parseSuppressionSourceTab(tableState.filters.source)
  const searchEmail = (tableState.filters.q ?? "").trim()
  const [addOpen, setAddOpen] = useState(false)

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      source: selectedSource === "all" ? undefined : selectedSource,
      offer_id: selectedOfferId ?? undefined,
      email: searchEmail || undefined,
    }),
    [
      searchEmail,
      selectedOfferId,
      selectedSource,
      tableState.cursor,
      tableState.limit,
    ]
  )

  const list = useSuppressionsList(listParams)
  const offers = useQuery({
    ...listQueryOptions("suppression-list-offers", () =>
      fetchActiveOffersForSuppression()
    ),
  })

  const offersById = useMemo(() => {
    const map = new Map<string, string>()
    for (const offer of offers.data?.data ?? []) {
      map.set(offer.id, `${offer.external_ref} · ${offer.name}`)
    }
    return map
  }, [offers.data?.data])

  const rows = useMemo((): SuppressionRow[] => {
    return (list.data?.data ?? []).map((row) => ({
      ...row,
      offer_label: row.offer_id
        ? (offersById.get(row.offer_id) ?? row.offer_id)
        : "—",
      added_by_label: row.added_by ? "Staff" : "System",
    }))
  }, [list.data?.data, offersById])

  const nextCursor = list.data?.next_cursor ?? null

  const removeMutation = useMutation({
    mutationFn: (row: SuppressionListItem) => removeSuppression(row.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("suppressions"),
      })
      toast.success("Address removed from suppression")
    },
    onError: (error) => {
      if (isHardBounceRemoveConflict(error)) {
        toast.error("Hard bounce suppressions cannot be removed")
        return
      }
      toast.error(
        isApiError(error) ? error.message : "Could not remove suppression"
      )
    },
  })

  function rowActions(row: SuppressionRow) {
    if (!canRemove) {
      return []
    }
    if (!canRemoveSuppression(row.source)) {
      return [
        {
          id: "cant-remove",
          label: "Can't remove",
          onSelect: () => {
            toast.message("Hard bounce suppressions cannot be removed")
          },
        },
      ]
    }
    return [
      {
        id: "remove",
        label: "Remove",
        destructive: true,
        confirm: {
          title: "Remove this address?",
          description: `${row.email ?? "This address"} will be eligible for engagement sends again.`,
          confirmLabel: "Remove",
        },
        onSelect: (selected: SuppressionRow) => {
          removeMutation.mutate(selected)
        },
      },
    ]
  }

  return (
    <div className="space-y-6">
      <ModuleSectionNav
        label="Suppression sections"
        current="list"
        testId="suppression-sections"
        items={[
          { id: "list", label: "List", href: "/suppression" },
          {
            id: "unsubscribe",
            label: "Unsubscribe",
            href: "/suppression/unsubscribe",
          },
        ]}
      />
      <PageHeader
        title="Suppression"
        description="Checked before every send. Hard bounces and complaints always apply, even to thank-you emails."
        actions={
          canAdd ? (
            <button
              type="button"
              className={suppressionPrimaryControl()}
              data-testid="suppression-add"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              Add address
            </button>
          ) : undefined
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load suppressions."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="suppressions"
        columns={suppressionColumns}
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
        rowActions={rowActions}
        testIdPrefix="suppressions"
        toolbar={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <SuppressionSourceTabs
              value={selectedSource}
              onChange={(value) => {
                tableState.setFilter(
                  "source",
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
                value={tableState.filters.q ?? ""}
                onChange={(event) => {
                  tableState.setFilter(
                    "q",
                    event.target.value.trim() ? event.target.value : undefined
                  )
                }}
                placeholder="Search email"
                className="h-9 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)]"
                data-testid="suppressions-search"
              />
            </label>
          </div>
        }
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="suppressions-empty"
          >
            No suppressions in this view.
            {canAdd
              ? " Add an address to keep it out of engagement sends."
              : null}
          </p>
        }
      />

      {canAdd ? (
        <AddSuppressionDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          defaultOfferId={selectedOfferId}
        />
      ) : null}
    </div>
  )
}
