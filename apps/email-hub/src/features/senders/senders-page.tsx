"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import {
  isSenderInUseConflict,
  parseSenderRouteConflicts,
  updateSender,
  type SenderListItem,
  type SenderRouteConflict,
} from "@/features/senders/api"
import { SenderInUseDialog } from "@/features/senders/sender-in-use-dialog"
import {
  SenderStatusTabs,
  type SenderStatusTabValue,
} from "@/features/senders/sender-status-tabs"
import { sendersColumns } from "@/features/senders/senders-columns"
import { sendersPrimaryControl } from "@/features/senders/senders-ui"
import { useSendersList } from "@/features/senders/use-senders-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { listQueryKey } from "@/lib/query-keys"

const SENDER_FILTER_KEYS = ["status", "q"] as const

type SendersPageProps = {
  canWrite?: boolean
}

function parseStatusTab(value: string | undefined): SenderStatusTabValue {
  return value === "inactive" ? "inactive" : "active"
}

export function SendersPage({ canWrite = false }: SendersPageProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const tableState = useDataTableUrlState({ filterKeys: SENDER_FILTER_KEYS })
  const selectedStatus = parseStatusTab(tableState.filters.status)
  const searchQuery = (tableState.filters.q ?? "").trim().toLowerCase()

  const [inUseOpen, setInUseOpen] = useState(false)
  const [inUseEmail, setInUseEmail] = useState("")
  const [inUseRoutes, setInUseRoutes] = useState<SenderRouteConflict[]>([])

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      status: selectedStatus,
    }),
    [selectedStatus, tableState.cursor, tableState.limit]
  )

  const list = useSendersList(listParams)
  const rows = useMemo(() => {
    const data = list.data?.data ?? []
    if (!searchQuery) {
      return data
    }
    return data.filter((row) => {
      const haystack =
        `${row.from_name} ${row.from_email} ${row.reply_to ?? ""}`.toLowerCase()
      return haystack.includes(searchQuery)
    })
  }, [list.data?.data, searchQuery])
  const nextCursor = list.data?.next_cursor ?? null

  const statusMutation = useMutation({
    mutationFn: (input: {
      id: string
      version: number
      status: "active" | "inactive"
      fromEmail: string
    }) =>
      updateSender(input.id, {
        version: input.version,
        status: input.status,
      }),
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [listQueryKey("senders")],
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey("senders") })
      toast.success(
        variables.status === "inactive" ? "Sender disabled" : "Sender enabled"
      )
    },
    onError: (error, variables) => {
      if (variables.status === "inactive" && isSenderInUseConflict(error)) {
        setInUseEmail(variables.fromEmail)
        setInUseRoutes(parseSenderRouteConflicts(error.details))
        setInUseOpen(true)
        return
      }
      toast.error(isApiError(error) ? error.message : "Could not update sender")
    },
  })

  function rowActions(row: SenderListItem) {
    if (!canWrite) {
      return []
    }
    if (row.status === "inactive") {
      return [
        {
          id: "edit",
          label: "Edit",
          onSelect: (selected: SenderListItem) => {
            router.push(`/senders/${encodeURIComponent(selected.id)}`)
          },
        },
        {
          id: "enable",
          label: "Enable",
          onSelect: (selected: SenderListItem) => {
            statusMutation.mutate({
              id: selected.id,
              version: selected.version,
              status: "active",
              fromEmail: selected.from_email,
            })
          },
        },
      ]
    }
    return [
      {
        id: "edit",
        label: "Edit",
        onSelect: (selected: SenderListItem) => {
          router.push(`/senders/${encodeURIComponent(selected.id)}`)
        },
      },
      {
        id: "disable",
        label: "Disable",
        destructive: true,
        confirm: {
          title: "Disable this sender?",
          description: `${row.from_email} will stop being available for new routes. Existing history is kept.`,
          confirmLabel: "Disable",
        },
        onSelect: (selected: SenderListItem) => {
          statusMutation.mutate({
            id: selected.id,
            version: selected.version,
            status: "inactive",
            fromEmail: selected.from_email,
          })
        },
      },
    ]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Senders"
        description="From addresses on verified domains. A sender in use by an active route can't be disabled."
        actions={
          canWrite ? (
            <Link
              href="/senders/new"
              className={sendersPrimaryControl()}
              data-testid="senders-add"
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              New sender
            </Link>
          ) : undefined
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load senders."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="senders"
        columns={sendersColumns}
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
        onRowClick={
          canWrite
            ? (row) => {
                router.push(`/senders/${encodeURIComponent(row.id)}`)
              }
            : undefined
        }
        rowActions={rowActions}
        testIdPrefix="senders"
        toolbar={
          <div className="flex w-full flex-wrap items-end justify-between gap-3">
            <SenderStatusTabs
              value={selectedStatus}
              onChange={(value) => {
                tableState.setFilter(
                  "status",
                  value === "active" ? undefined : value
                )
              }}
            />
            <label className="relative block min-w-[14rem] flex-1 sm:max-w-xs">
              <span className="sr-only">Search senders</span>
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
                placeholder="Search senders"
                className="h-9 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)]"
                data-testid="senders-search"
              />
            </label>
          </div>
        }
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="senders-empty"
          >
            No senders in this view.
          </p>
        }
      />

      <SenderInUseDialog
        open={inUseOpen}
        onOpenChange={setInUseOpen}
        fromEmail={inUseEmail}
        routes={inUseRoutes}
      />
    </div>
  )
}
