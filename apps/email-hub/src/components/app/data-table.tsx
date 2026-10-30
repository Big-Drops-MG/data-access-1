"use client"

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  MoreHorizontal,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import {
  readColumnVisibility,
  writeColumnVisibility,
} from "@/lib/data-table/column-visibility"
import {
  DATA_TABLE_PAGE_SIZES,
  type DataTablePageSize,
} from "@/lib/data-table/page-size"
import type { DataTableSort } from "@/lib/data-table/url-state"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

export type DataTableRowAction<TData> = {
  id: string
  label: string
  onSelect: (row: TData) => void
  destructive?: boolean
  confirm?: {
    title: string
    description: string
    confirmLabel?: string
    confirmPhrase?: string
  }
}

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  /** Namespaces localStorage column visibility (SD#12.5). */
  storageKey: string
  getRowId: (row: TData) => string
  nextCursor: string | null
  pageSize: DataTablePageSize
  onPageSizeChange: (size: DataTablePageSize) => void
  onNextPage: (nextCursor: string) => void
  onPreviousPage: () => void
  canPreviousPage: boolean
  /** Server-supported sorting only; omit when the API has a fixed order. */
  sorting?: DataTableSort | undefined
  onSortingChange?: (sorting: DataTableSort | undefined) => void
  sortableColumnIds?: readonly string[]
  onRowClick?: (row: TData) => void
  rowActions?: (row: TData) => DataTableRowAction<TData>[]
  toolbar?: ReactNode
  onExportCsv?: () => Promise<void> | void
  exporting?: boolean
  isLoading?: boolean
  emptyState?: ReactNode
  testIdPrefix?: string
  className?: string
}

function toTanstackSorting(sort: DataTableSort | undefined): SortingState {
  if (!sort) {
    return []
  }
  return [{ id: sort.id, desc: sort.desc }]
}

export function DataTable<TData>({
  columns,
  data,
  storageKey,
  getRowId,
  nextCursor,
  pageSize,
  onPageSizeChange,
  onNextPage,
  onPreviousPage,
  canPreviousPage,
  sorting,
  onSortingChange,
  sortableColumnIds = [],
  onRowClick,
  rowActions,
  toolbar,
  onExportCsv,
  exporting = false,
  isLoading = false,
  emptyState,
  testIdPrefix = "data-table",
  className,
}: DataTableProps<TData>) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () =>
      typeof window === "undefined" ? {} : readColumnVisibility(storageKey)
  )
  const [pendingAction, setPendingAction] = useState<{
    row: TData
    action: DataTableRowAction<TData>
  } | null>(null)
  const [loadedStorageKey, setLoadedStorageKey] = useState(storageKey)

  if (loadedStorageKey !== storageKey) {
    setLoadedStorageKey(storageKey)
    setColumnVisibility(readColumnVisibility(storageKey))
  }

  useEffect(() => {
    writeColumnVisibility(storageKey, columnVisibility)
  }, [storageKey, columnVisibility])

  const sortableSet = useMemo(
    () => new Set(sortableColumnIds),
    [sortableColumnIds]
  )

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => getRowId(row),
    state: {
      columnVisibility,
      sorting: toTanstackSorting(sorting),
    },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      if (!onSortingChange) {
        return
      }
      const next =
        typeof updater === "function"
          ? updater(toTanstackSorting(sorting))
          : updater
      const first = next[0]
      onSortingChange(
        first ? { id: first.id, desc: Boolean(first.desc) } : undefined
      )
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: true,
  })

  const hasRows = data.length > 0
  const showEmpty = !isLoading && !hasRows && emptyState

  function handleHeaderSort(columnId: string) {
    if (!onSortingChange || !sortableSet.has(columnId)) {
      return
    }
    if (!sorting || sorting.id !== columnId) {
      onSortingChange({ id: columnId, desc: true })
      return
    }
    if (sorting.desc) {
      onSortingChange({ id: columnId, desc: false })
      return
    }
    onSortingChange(undefined)
  }

  function handleRowClick(row: TData, event: MouseEvent<HTMLTableRowElement>) {
    if (!onRowClick) {
      return
    }
    const target = event.target as HTMLElement
    if (target.closest("[data-row-menu]") || target.closest("a,button,input")) {
      return
    }
    onRowClick(row)
  }

  return (
    <div className={cn("space-y-3", className)} data-testid={testIdPrefix}>
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onExportCsv ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting || isLoading}
              onClick={() => {
                void onExportCsv()
              }}
              data-testid={`${testIdPrefix}-export`}
            >
              <Download strokeWidth={1.75} />
              Export CSV
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid={`${testIdPrefix}-columns`}
                />
              }
            >
              <Columns3 strokeWidth={1.75} />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => {
                      column.toggleVisibility(Boolean(checked))
                    }}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showEmpty ? (
        emptyState
      ) : (
        <div className="rounded-md border border-border bg-surface">
          <Table className="w-full">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const canSort = sortableSet.has(header.column.id)
                    const sorted = header.column.getIsSorted()
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 text-left font-medium outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]"
                            onClick={() => handleHeaderSort(header.column.id)}
                            data-testid={`${testIdPrefix}-sort-${header.column.id}`}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowUpDown
                                className="size-3.5 text-fg-muted"
                                aria-hidden
                              />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
                        )}
                      </TableHead>
                    )
                  })}
                  {rowActions ? (
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: Math.min(pageSize, 8) }).map(
                    (_, index) => (
                      <TableRow key={`skeleton-${index}`} aria-hidden>
                        {columns.map((_, cellIndex) => (
                          <TableCell key={cellIndex}>
                            <div className="h-4 animate-pulse rounded bg-surface-2" />
                          </TableCell>
                        ))}
                        {rowActions ? (
                          <TableCell>
                            <div className="h-4 w-6 animate-pulse rounded bg-surface-2" />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  )
                : table.getRowModel().rows.map((row) => {
                    const actions = rowActions?.(row.original) ?? []
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(onRowClick && "cursor-pointer")}
                        onClick={(event) => handleRowClick(row.original, event)}
                        data-testid={`${testIdPrefix}-row`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                        {rowActions ? (
                          <TableCell data-row-menu>
                            {actions.length > 0 ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label="Row actions"
                                      data-testid={`${testIdPrefix}-row-menu`}
                                    />
                                  }
                                >
                                  <MoreHorizontal strokeWidth={1.75} />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {actions.map((action) => (
                                    <DropdownMenuItem
                                      key={action.id}
                                      variant={
                                        action.destructive
                                          ? "destructive"
                                          : "default"
                                      }
                                      onClick={() => {
                                        if (action.confirm) {
                                          setPendingAction({
                                            row: row.original,
                                            action,
                                          })
                                          return
                                        }
                                        action.onSelect(row.original)
                                      }}
                                    >
                                      {action.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <label htmlFor={`${testIdPrefix}-page-size`} className="sr-only">
            Rows per page
          </label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              if (value != null) {
                onPageSizeChange(Number(value) as DataTablePageSize)
              }
            }}
          >
            <SelectTrigger
              id={`${testIdPrefix}-page-size`}
              size="sm"
              data-testid={`${testIdPrefix}-page-size`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_TABLE_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canPreviousPage || isLoading}
            onClick={onPreviousPage}
            data-testid={`${testIdPrefix}-prev`}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!nextCursor || isLoading}
            onClick={() => {
              if (nextCursor) {
                onNextPage(nextCursor)
              }
            }}
            data-testid={`${testIdPrefix}-next`}
          >
            Next
          </Button>
        </div>
      </div>

      {pendingAction?.action.confirm ? (
        <ConfirmDialog
          open={Boolean(pendingAction)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingAction(null)
            }
          }}
          title={pendingAction.action.confirm.title}
          description={pendingAction.action.confirm.description}
          confirmLabel={pendingAction.action.confirm.confirmLabel}
          confirmPhrase={pendingAction.action.confirm.confirmPhrase}
          destructive={pendingAction.action.destructive}
          onConfirm={() => {
            pendingAction.action.onSelect(pendingAction.row)
            setPendingAction(null)
          }}
        />
      ) : null}
    </div>
  )
}
