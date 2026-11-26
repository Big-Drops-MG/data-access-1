"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"

import { useOfferSelection } from "@/components/app/offer-provider"
import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import {
  acknowledgeAlert,
  type AlertListItem,
  type AlertSeverity,
  type AlertStatus,
} from "@/features/alerts/api"
import { alertsColumns } from "@/features/alerts/alerts-columns"
import {
  isAcknowledged,
  parseAlertStatusTab,
  type AlertStatusTabValue,
} from "@/features/alerts/alerts-status"
import { AlertsStatusTabs } from "@/features/alerts/alerts-status-tabs"
import { useAlertsList } from "@/features/alerts/use-alerts-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { listQueryKey } from "@/lib/query-keys"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const FILTER_KEYS = ["status", "severity"] as const

type SeverityFilterValue = "all" | AlertSeverity

function parseSeverityFilter(raw: string | undefined): SeverityFilterValue {
  if (raw === "critical" || raw === "warn" || raw === "info") {
    return raw
  }
  return "all"
}

type AlertsPageProps = {
  canAck?: boolean
  currentUserId?: string | null
}

export function AlertsPage({
  canAck = false,
  currentUserId = null,
}: AlertsPageProps) {
  const queryClient = useQueryClient()
  const { selectedOfferId } = useOfferSelection()
  const tableState = useDataTableUrlState({ filterKeys: FILTER_KEYS })
  const selectedStatus = parseAlertStatusTab(tableState.filters.status)
  const selectedSeverity = parseSeverityFilter(tableState.filters.severity)

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      status:
        selectedStatus === "all" ? undefined : (selectedStatus as AlertStatus),
      severity: selectedSeverity === "all" ? undefined : selectedSeverity,
      offer_id: selectedOfferId ?? undefined,
    }),
    [
      selectedOfferId,
      selectedSeverity,
      selectedStatus,
      tableState.cursor,
      tableState.limit,
    ]
  )

  const list = useAlertsList(listParams)
  const openForCounts = useAlertsList({
    status: "open",
    limit: 200,
    offer_id: selectedOfferId ?? undefined,
  })
  const resolvedForCounts = useAlertsList({
    status: "resolved",
    limit: 200,
    offer_id: selectedOfferId ?? undefined,
  })

  const counts = useMemo(() => {
    const open = openForCounts.data?.data.length ?? 0
    const resolved = resolvedForCounts.data?.data.length ?? 0
    const next: Partial<Record<AlertStatusTabValue, number>> = {
      open,
      resolved,
      all: open + resolved,
    }
    return next
  }, [openForCounts.data?.data.length, resolvedForCounts.data?.data.length])

  const columns = useMemo(() => alertsColumns(currentUserId), [currentUserId])

  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  const ackMutation = useMutation({
    mutationFn: (id: string) => acknowledgeAlert(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey("alerts") })
      toast.success("Alert acknowledged")
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not acknowledge alert"
      )
    },
  })

  function rowActions(row: AlertListItem) {
    if (!canAck || isAcknowledged(row)) {
      return []
    }
    return [
      {
        id: "ack",
        label: "Acknowledge",
        onSelect: (selected: AlertListItem) => {
          ackMutation.mutate(selected.id)
        },
      },
    ]
  }

  return (
    <div className="space-y-6" data-testid="alerts-page">
      <PageHeader
        title="Alerts"
        description="Operational alerts from workers and integrations. Acknowledge so the team knows someone is looking."
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load alerts."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="alerts"
        columns={columns}
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
        emptyState={
          <p className="text-sm text-fg-muted">
            {selectedStatus === "open"
              ? "No open alerts."
              : selectedStatus === "resolved"
                ? "No resolved alerts."
                : "No alerts yet."}
          </p>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <AlertsStatusTabs
              value={selectedStatus}
              counts={counts}
              onChange={(value) => {
                tableState.setFilter(
                  "status",
                  value === "open" ? undefined : value
                )
              }}
            />
            <Select
              value={selectedSeverity}
              onValueChange={(value) => {
                tableState.setFilter(
                  "severity",
                  value === "all" ? undefined : value
                )
              }}
            >
              <SelectTrigger
                className="h-9 w-[150px] text-[13px]"
                aria-label="Filter by severity"
                data-testid="alerts-severity-filter"
              >
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
    </div>
  )
}
