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
import { AnimatePresence, motion } from "motion/react"
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
  /** Column visibility menu (default true). */
  showColumnToggle?: boolean
  /** Equal-width columns via table-fixed (balanced list layouts). */
  equalColumnWidths?: boolean
  /** Animate row enter/exit (status filter changes without layout jitter). */
  animateRows?: boolean
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
  showColumnToggle = true,
  equalColumnWidths = false,
  animateRows = false,
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
  const showEmpty = !isLoading && !hasRows
  const dataColumnCount = table.getVisibleLeafColumns().length
  const visibleColumnCount = dataColumnCount + (rowActions ? 1 : 0)
  // Equal widths apply to data columns only; actions stay a fixed narrow rail.
  const equalColStyle = equalColumnWidths
    ? {
        width: rowActions
          ? `calc((100% - 3.5rem) / ${Math.max(dataColumnCount, 1)})`
          : `${100 / Math.max(dataColumnCount, 1)}%`,
      }
    : undefined
  const actionsColStyle = rowActions ? { width: "3.5rem" } : undefined
  const rowMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
  }

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

  const showToolbarActions = Boolean(onExportCsv) || showColumnToggle

  return (
    <div className={cn("space-y-3", className)} data-testid={testIdPrefix}>
      {toolbar || showToolbarActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {showToolbarActions ? (
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

              {showColumnToggle ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <Table className={cn("w-full", equalColumnWidths && "table-fixed")}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = sortableSet.has(header.column.id)
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      style={equalColStyle}
                      className={cn(
                        "bg-surface-2 text-caption font-semibold tracking-wide text-fg-muted uppercase",
                        equalColumnWidths && "whitespace-normal"
                      )}
                    >
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
                  <TableHead
                    style={actionsColStyle}
                    className="w-14 bg-surface-2 px-2 text-right"
                  >
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 8) }).map((_, index) => (
                <TableRow key={`skeleton-${index}`} aria-hidden>
                  {Array.from({ length: dataColumnCount }).map(
                    (_, cellIndex) => (
                      <TableCell key={cellIndex} style={equalColStyle}>
                        <div className="h-4 animate-pulse rounded bg-surface-2" />
                      </TableCell>
                    )
                  )}
                  {rowActions ? (
                    <TableCell style={actionsColStyle} className="w-14 px-2">
                      <div className="ml-auto size-8 animate-pulse rounded-md bg-surface-2" />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : showEmpty ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={Math.max(visibleColumnCount, 1)}
                  className="p-0"
                >
                  {emptyState ?? (
                    <p
                      className="px-4 py-10 text-center text-body text-fg-muted"
                      data-testid={`${testIdPrefix}-empty`}
                    >
                      No rows
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {table.getRowModel().rows.map((row) => {
                  const actions = rowActions?.(row.original) ?? []
                  const cells = row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} style={equalColStyle}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))
                  const actionCell = rowActions ? (
                    <TableCell
                      data-row-menu
                      style={actionsColStyle}
                      className="w-14 px-2 text-right"
                    >
                      {actions.length > 0 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-8 border-border bg-surface text-fg-muted shadow-sm hover:bg-surface-2 hover:text-fg"
                                aria-label="Open row actions"
                                title="Actions"
                                data-testid={`${testIdPrefix}-row-menu`}
                              />
                            }
                          >
                            <MoreHorizontal
                              className="size-4"
                              strokeWidth={2}
                              aria-hidden
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            side="bottom"
                            sideOffset={8}
                            className="w-44 border border-border bg-surface shadow-lg"
                          >
                            {actions.map((action) => (
                              <DropdownMenuItem
                                key={action.id}
                                variant={
                                  action.destructive ? "destructive" : "default"
                                }
                                className={cn(
                                  "cursor-pointer",
                                  !action.destructive &&
                                    "focus:bg-surface-2 focus:text-fg"
                                )}
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
                  ) : null

                  if (animateRows) {
                    return (
                      <motion.tr
                        key={row.id}
                        layout="position"
                        initial={rowMotion.initial}
                        animate={rowMotion.animate}
                        exit={rowMotion.exit}
                        transition={rowMotion.transition}
                        className={cn(
                          "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                          onRowClick && "cursor-pointer"
                        )}
                        onClick={(event) => {
                          handleRowClick(
                            row.original,
                            event as MouseEvent<HTMLTableRowElement>
                          )
                        }}
                        data-testid={`${testIdPrefix}-row`}
                      >
                        {cells}
                        {actionCell}
                      </motion.tr>
                    )
                  }

                  return (
                    <TableRow
                      key={row.id}
                      className={cn(onRowClick && "cursor-pointer")}
                      onClick={(event) => handleRowClick(row.original, event)}
                      data-testid={`${testIdPrefix}-row`}
                    >
                      {cells}
                      {actionCell}
                    </TableRow>
                  )
                })}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-1">
        <div className="flex items-center gap-2.5">
          <label
            htmlFor={`${testIdPrefix}-page-size`}
            className="text-[13px] leading-none font-medium tracking-tight text-fg-muted"
          >
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
              data-testid={`${testIdPrefix}-page-size`}
              className="h-auto min-w-16 gap-1.5 rounded-md border-border bg-surface py-1.5 pr-2 pl-3.5 text-[13px] leading-none font-medium tracking-tight text-fg shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 hover:bg-surface-2 data-[size=default]:h-auto data-[size=sm]:h-auto [&_svg:not([class*='size-'])]:size-3.5"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="min-w-28 rounded-xl p-1 shadow-md"
            >
              {DATA_TABLE_PAGE_SIZES.map((size) => (
                <SelectItem
                  key={size}
                  value={String(size)}
                  className="rounded-lg py-2 pr-8 pl-3 text-[13px] font-medium tracking-tight"
                >
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            disabled={!canPreviousPage || isLoading}
            onClick={onPreviousPage}
            data-testid={`${testIdPrefix}-prev`}
            className="h-auto rounded-md border-border bg-surface px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight text-fg shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 hover:bg-surface-2 disabled:opacity-40"
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!nextCursor || isLoading}
            onClick={() => {
              if (nextCursor) {
                onNextPage(nextCursor)
              }
            }}
            data-testid={`${testIdPrefix}-next`}
            className="h-auto rounded-md border-border bg-surface px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight text-fg shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 hover:bg-surface-2 disabled:opacity-40"
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
