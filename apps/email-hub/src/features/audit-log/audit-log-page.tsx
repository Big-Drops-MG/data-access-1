"use client"

import { useMemo, useState } from "react"

import { DataTable } from "@/components/app/data-table"
import { EtDatePicker } from "@/components/app/et-date-picker"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import type { AuditLogListItem } from "@/features/audit-log/api"
import { auditLogColumns } from "@/features/audit-log/audit-log-columns"
import { AuditLogDetailDialog } from "@/features/audit-log/audit-log-detail-dialog"
import {
  auditLogClearButtonClass,
  auditLogDateTriggerClass,
  auditLogFieldControlClass,
  auditLogFilterFieldClass,
  auditLogFilterLabelClass,
  auditLogSelectContentClass,
  auditLogSelectItemClass,
  auditLogSelectTriggerClass,
} from "@/features/audit-log/audit-log-ui"
import { useAuditActors } from "@/features/audit-log/use-audit-actors"
import { useAuditLogList } from "@/features/audit-log/use-audit-log-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const FILTER_KEYS = [
  "actor_type",
  "actor_id",
  "action",
  "object_type",
  "object_id",
  "from",
  "to",
] as const

const ACTOR_TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "user", label: "User" },
  { value: "api_client", label: "API client" },
  { value: "system", label: "System" },
] as const

function parseActorType(
  value: string | undefined
): AuditLogListItem["actor_type"] | undefined {
  if (value === "user" || value === "api_client" || value === "system") {
    return value
  }
  return undefined
}

export function AuditLogPage() {
  const tableState = useDataTableUrlState({ filterKeys: FILTER_KEYS })
  const [selected, setSelected] = useState<AuditLogListItem | null>(null)
  const actorType = parseActorType(tableState.filters.actor_type)
  const actorId = (tableState.filters.actor_id ?? "").trim()
  const action = (tableState.filters.action ?? "").trim()
  const objectType = (tableState.filters.object_type ?? "").trim()
  const objectId = (tableState.filters.object_id ?? "").trim()
  const from = (tableState.filters.from ?? "").trim()
  const to = (tableState.filters.to ?? "").trim()

  const hasActiveFilters = Boolean(
    actorType || actorId || action || objectType || objectId || from || to
  )

  const listParams = useMemo(
    () => ({
      limit: tableState.limit,
      cursor: tableState.cursor,
      actor_type: actorType,
      actor_id: actorId || undefined,
      action: action || undefined,
      object_type: objectType || undefined,
      object_id: objectId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [
      action,
      actorId,
      actorType,
      from,
      objectId,
      objectType,
      tableState.cursor,
      tableState.limit,
      to,
    ]
  )

  const list = useAuditLogList(listParams)
  const actorsQuery = useAuditActors()
  const rows = list.data?.data ?? []
  const nextCursor = list.data?.next_cursor ?? null

  const actorOptions = useMemo(() => {
    const all = actorsQuery.data?.data ?? []
    if (!actorType || actorType === "system") {
      return all
    }
    return all.filter((actor) => actor.type === actorType)
  }, [actorType, actorsQuery.data?.data])

  const actorSelectItems = useMemo(
    () => [
      { value: "all", label: "All actors" },
      ...actorOptions.map((actor) => ({
        value: actor.id,
        label:
          actor.type === "api_client"
            ? `${actor.name} (API client)`
            : actor.name,
      })),
    ],
    [actorOptions]
  )

  function clearFilters() {
    tableState.setFilters({})
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Append-only record of Hub changes. Filter by actor, action, object, or Eastern date range."
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load audit log."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <section
        className="rounded-xl border border-border bg-surface p-4"
        aria-label="Audit log filters"
        data-testid="audit-log-filters"
      >
        <div className="flex flex-nowrap items-start gap-3 overflow-x-auto pb-1">
          <div className={auditLogFilterFieldClass("w-[9.5rem]")}>
            <p className={auditLogFilterLabelClass()}>Actor type</p>
            <Select
              value={actorType ?? "all"}
              items={[...ACTOR_TYPE_OPTIONS]}
              onValueChange={(next) => {
                if (next == null || next === "all") {
                  tableState.setFilter("actor_type", undefined)
                  return
                }
                tableState.setFilter("actor_type", next)
                if (next === "system") {
                  tableState.setFilter("actor_id", undefined)
                  return
                }
                const selectedActor = actorsQuery.data?.data.find(
                  (actor) => actor.id === actorId
                )
                if (selectedActor && selectedActor.type !== next) {
                  tableState.setFilter("actor_id", undefined)
                }
              }}
            >
              <SelectTrigger
                size="default"
                className={auditLogSelectTriggerClass}
                data-testid="audit-log-actor-type"
              >
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent
                align="start"
                side="bottom"
                sideOffset={8}
                className={auditLogSelectContentClass}
              >
                {ACTOR_TYPE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className={auditLogSelectItemClass}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={auditLogFilterFieldClass("w-[11rem]")}>
            <p className={auditLogFilterLabelClass()}>Actor</p>
            <Select
              value={actorId || "all"}
              items={actorSelectItems}
              disabled={actorType === "system"}
              onValueChange={(next) => {
                if (next == null || next === "all") {
                  tableState.setFilter("actor_id", undefined)
                  return
                }
                tableState.setFilter("actor_id", next)
                const selectedActor = actorsQuery.data?.data.find(
                  (actor) => actor.id === next
                )
                if (selectedActor) {
                  tableState.setFilter("actor_type", selectedActor.type)
                }
              }}
            >
              <SelectTrigger
                size="default"
                className={auditLogSelectTriggerClass}
                data-testid="audit-log-actor-id"
              >
                <SelectValue placeholder="All actors" />
              </SelectTrigger>
              <SelectContent
                align="start"
                side="bottom"
                sideOffset={8}
                className={auditLogSelectContentClass}
              >
                {actorSelectItems.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className={auditLogSelectItemClass}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className={auditLogFilterFieldClass("w-[10.5rem]")}>
            <span className={auditLogFilterLabelClass()}>Action</span>
            <input
              type="text"
              value={tableState.filters.action ?? ""}
              onChange={(event) => {
                tableState.setFilter(
                  "action",
                  event.target.value.trim() ? event.target.value : undefined
                )
              }}
              placeholder="e.g. domain.create"
              className={auditLogFieldControlClass}
              data-testid="audit-log-action"
            />
          </label>

          <label className={auditLogFilterFieldClass("w-[9.5rem]")}>
            <span className={auditLogFilterLabelClass()}>Object type</span>
            <input
              type="text"
              value={tableState.filters.object_type ?? ""}
              onChange={(event) => {
                tableState.setFilter(
                  "object_type",
                  event.target.value.trim() ? event.target.value : undefined
                )
              }}
              placeholder="e.g. domain"
              className={auditLogFieldControlClass}
              data-testid="audit-log-object-type"
            />
          </label>

          <label className={auditLogFilterFieldClass("w-[12rem]")}>
            <span className={auditLogFilterLabelClass()}>Object id</span>
            <input
              type="text"
              value={tableState.filters.object_id ?? ""}
              onChange={(event) => {
                tableState.setFilter(
                  "object_id",
                  event.target.value.trim() ? event.target.value : undefined
                )
              }}
              placeholder="Filter by object id"
              className={auditLogFieldControlClass}
              data-testid="audit-log-object-id"
            />
          </label>

          <EtDatePicker
            className="w-[10.5rem] shrink-0"
            label="From (ET)"
            value={from}
            onChange={(value) => {
              tableState.setFilter("from", value || undefined)
            }}
            placeholder="Start date"
            triggerClassName={auditLogDateTriggerClass}
            data-testid="audit-log-from"
          />

          <EtDatePicker
            className="w-[10.5rem] shrink-0"
            label="To (ET)"
            value={to}
            onChange={(value) => {
              tableState.setFilter("to", value || undefined)
            }}
            placeholder="End date"
            triggerClassName={auditLogDateTriggerClass}
            data-testid="audit-log-to"
          />

          <div className={auditLogFilterFieldClass("w-[7.5rem]")}>
            <span className={auditLogFilterLabelClass()} aria-hidden>
              {"\u00a0"}
            </span>
            <Button
              type="button"
              variant="outline"
              className={auditLogClearButtonClass}
              disabled={!hasActiveFilters}
              onClick={clearFilters}
              data-testid="audit-log-clear-filters"
            >
              Clear
            </Button>
          </div>
        </div>
      </section>

      <DataTable
        storageKey="audit-log"
        columns={auditLogColumns}
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
        onRowClick={setSelected}
        testIdPrefix="audit-log"
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="audit-log-empty"
          >
            No audit entries match these filters.
          </p>
        }
      />

      <AuditLogDetailDialog
        entry={selected}
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
      />
    </div>
  )
}
