"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useOfferSelection } from "@/components/app/offer-provider"
import { PageHeader } from "@/components/app/page-header"
import {
  archiveEmailRoute,
  updateEmailRoute,
  type EmailRouteListItem,
} from "@/features/email-routes/api"
import {
  emailRoutesColumns,
  type EmailRouteRow,
} from "@/features/email-routes/email-routes-columns"
import {
  EmailRouteStatusTabs,
  type EmailRouteStatusTabValue,
} from "@/features/email-routes/email-route-status-tabs"
import { emailRoutesPrimaryControl } from "@/features/email-routes/email-routes-ui"
import { NewRouteDialog } from "@/features/email-routes/new-route-dialog"
import { useEmailRoutesList } from "@/features/email-routes/use-email-routes-list"
import { useRouteListLookups } from "@/features/email-routes/use-route-form-options"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { listQueryKey } from "@/lib/query-keys"

const ROUTE_FILTER_KEYS = ["status"] as const

type EmailRoutesPageProps = {
  canWrite?: boolean
}

function parseStatusTab(value: string | undefined): EmailRouteStatusTabValue {
  return value === "inactive" ? "inactive" : "active"
}

export function EmailRoutesPage({ canWrite = false }: EmailRoutesPageProps) {
  const queryClient = useQueryClient()
  const { selectedOfferId } = useOfferSelection()
  const tableState = useDataTableUrlState({ filterKeys: ROUTE_FILTER_KEYS })
  const selectedStatus = parseStatusTab(tableState.filters.status)
  const [createOpen, setCreateOpen] = useState(false)
  const lookups = useRouteListLookups()

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      status: selectedStatus,
      offer_id: selectedOfferId ?? undefined,
    }),
    [selectedOfferId, selectedStatus, tableState.cursor, tableState.limit]
  )

  const list = useEmailRoutesList(listParams)
  const activeForCounts = useEmailRoutesList({
    status: "active",
    limit: 100,
    offer_id: selectedOfferId ?? undefined,
  })
  const inactiveForCounts = useEmailRoutesList({
    status: "inactive",
    limit: 100,
    offer_id: selectedOfferId ?? undefined,
  })
  const statusCounts = useMemo(
    () => ({
      active: activeForCounts.data?.data.length ?? 0,
      inactive: inactiveForCounts.data?.data.length ?? 0,
    }),
    [activeForCounts.data?.data.length, inactiveForCounts.data?.data.length]
  )

  const rows = useMemo((): EmailRouteRow[] => {
    return (list.data?.data ?? []).map((row) => {
      const template = lookups.templatesById.get(row.template_id)
      const sender = lookups.sendersById.get(row.sender_id)
      const offer = row.offer_id
        ? lookups.offersById.get(row.offer_id)
        : undefined
      return {
        ...row,
        template_label: template
          ? template.version != null
            ? `${template.name} · v${template.version}`
            : template.name
          : row.template_id,
        sender_label: sender
          ? `${sender.from_name} <${sender.from_email}>`
          : row.sender_id,
        offer_label: offer
          ? `${offer.external_ref} · ${offer.name}`
          : (row.offer_id ?? "—"),
      }
    })
  }, [
    list.data?.data,
    lookups.offersById,
    lookups.sendersById,
    lookups.templatesById,
  ])

  const nextCursor = list.data?.next_cursor ?? null

  const archiveMutation = useMutation({
    mutationFn: (row: EmailRouteListItem) => archiveEmailRoute(row.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("email-routes"),
      })
      toast.success("Route archived")
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.message : "Could not archive route")
    },
  })

  const activateMutation = useMutation({
    mutationFn: (row: EmailRouteListItem) =>
      updateEmailRoute(row.id, { version: row.version, status: "active" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("email-routes"),
      })
      toast.success("Route activated")
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        toast.error(
          "An active route already exists for this email type and offer"
        )
        return
      }
      toast.error(
        isApiError(error) ? error.message : "Could not activate route"
      )
    },
  })

  function rowActions(row: EmailRouteRow) {
    if (!canWrite) {
      return []
    }
    if (row.status === "inactive") {
      return [
        {
          id: "activate",
          label: "Activate",
          onSelect: (selected: EmailRouteRow) => {
            activateMutation.mutate(selected)
          },
        },
      ]
    }
    return [
      {
        id: "archive",
        label: "Archive",
        destructive: true,
        confirm: {
          title: "Archive this route?",
          description:
            "Triggered emails will stop using this route until you activate it again or create a replacement.",
          confirmLabel: "Archive",
        },
        onSelect: (selected: EmailRouteRow) => {
          archiveMutation.mutate(selected)
        },
      },
    ]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email routes"
        description="Map each email type and offer to a published template and active sender."
        actions={
          canWrite ? (
            <button
              type="button"
              className={emailRoutesPrimaryControl()}
              data-testid="email-routes-add"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              New route
            </button>
          ) : undefined
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load email routes."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="email-routes"
        columns={emailRoutesColumns}
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
        testIdPrefix="email-routes"
        toolbar={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <EmailRouteStatusTabs
              value={selectedStatus}
              counts={statusCounts}
              onChange={(value) => {
                tableState.setFilter(
                  "status",
                  value === "active" ? undefined : value
                )
              }}
            />
          </div>
        }
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="email-routes-empty"
          >
            No routes in this view.
            {canWrite ? " Create a route for an offer to get started." : null}
          </p>
        }
      />

      <p className="text-caption text-fg-muted">
        Only one active route can exist for each email type and offer.
      </p>

      {canWrite ? (
        <NewRouteDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultOfferId={selectedOfferId}
        />
      ) : null}
    </div>
  )
}
