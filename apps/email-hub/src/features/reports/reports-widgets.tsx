import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { StatusBadge } from "@/components/app/status-badge"

const countFmt = new Intl.NumberFormat("en-US")

export const reportsSelectClass =
  "h-9 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]"

export const reportsOutlineButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-fg transition-colors outline-none hover:bg-surface-2 focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"

export function formatCount(value: number): string {
  return countFmt.format(value)
}

export function formatPercent(rate: number | null, digits = 1): string {
  if (rate == null || !Number.isFinite(rate)) {
    return "—"
  }
  return `${(rate * 100).toFixed(digits)}%`
}

export function ReportSection({
  title,
  description,
  action,
  children,
  testId,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-surface"
      data-testid={testId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description ? (
            <p className="text-[12px] text-fg-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function KpiGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>
}) {
  return (
    <div className="grid grid-cols-5 gap-3" data-testid="reports-kpis">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-surface px-3 py-3"
        >
          <p className="text-caption font-medium tracking-wide text-fg-muted uppercase">
            {item.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function barHeight(value: number, max: number): string {
  if (value <= 0 || max <= 0) {
    return "0%"
  }
  return `${Math.max(4, (value / max) * 100)}%`
}

export function GroupedBars({
  rows,
  leftLabel,
  rightLabel,
}: {
  rows: Array<{ label: string; left: number; right: number }>
  leftLabel: string
  rightLabel: string
}) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.left, row.right]))
  return (
    <figure className="px-4 py-4">
      <div className="mb-3 flex items-center justify-end gap-4 text-[12px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-1" aria-hidden />
          {leftLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-err" aria-hidden />
          {rightLabel}
        </span>
      </div>
      <div className="overflow-x-auto">
        <ul
          className="flex h-52 min-w-full items-end gap-3"
          style={{ minWidth: Math.max(rows.length, 1) * 56 }}
        >
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div
                className="flex h-40 w-full items-end justify-center gap-1"
                role="img"
                aria-label={`${row.label}: ${formatCount(row.left)} ${leftLabel}, ${formatCount(row.right)} ${rightLabel}`}
              >
                <span
                  className="w-3 rounded-t bg-chart-1"
                  style={{ height: barHeight(row.left, max) }}
                />
                <span
                  className="w-3 rounded-t bg-err"
                  style={{ height: barHeight(row.right, max) }}
                />
              </div>
              <span className="text-caption text-fg-muted">{row.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}

export function SingleBars({
  rows,
  caption,
}: {
  rows: Array<{ label: string; value: number }>
  caption?: string
}) {
  const max = Math.max(0.001, ...rows.map((row) => row.value))
  return (
    <figure className="px-4 py-4">
      {caption ? (
        <p className="mb-3 text-[12px] text-fg-muted">{caption}</p>
      ) : null}
      <div className="overflow-x-auto">
        <ul
          className="flex h-52 min-w-full items-end gap-3"
          style={{ minWidth: Math.max(rows.length, 1) * 48 }}
        >
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div
                className="flex h-40 w-full items-end justify-center"
                role="img"
                aria-label={`${row.label}: ${formatPercent(row.value, 2)}`}
              >
                <span
                  className="w-8 rounded-t bg-chart-2"
                  style={{ height: barHeight(row.value, max) }}
                />
              </div>
              <span className="text-caption text-fg-muted">{row.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}

export function HorizontalBars({
  rows,
  valueLabel,
  barClass,
}: {
  rows: Array<{
    label: string
    value: number
    display: string
    barClass?: string
  }>
  valueLabel: string
  barClass?: string
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="space-y-3 px-4 py-4">
      {rows.map((row) => (
        <li
          key={row.label}
          className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3"
        >
          <span className="truncate text-sm text-fg">{row.label}</span>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={`${row.label}: ${row.display} ${valueLabel}`}
          >
            <div
              className={cn(
                "h-2 rounded-full",
                row.barClass ?? barClass ?? "bg-chart-1"
              )}
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-right text-sm text-fg tabular-nums">
            {row.display}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ReportTable({
  columns,
  rows,
  empty,
  testId,
}: {
  columns: string[]
  rows: Array<{ id: string; cells: ReactNode[] }>
  empty: string
  testId: string
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full min-w-[40rem] border-collapse text-left text-sm"
        data-testid={testId}
      >
        <thead className="bg-surface-2 text-caption font-medium tracking-wide text-fg-muted uppercase">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-2.5 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-fg-muted"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                {row.cells.map((cell, index) =>
                  index === 0 ? (
                    <th
                      key={`${row.id}-${index}`}
                      scope="row"
                      className="px-4 py-2.5 font-medium text-fg"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td
                      key={`${row.id}-${index}`}
                      className="px-4 py-2.5 text-fg tabular-nums"
                    >
                      {cell}
                    </td>
                  )
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-fg-muted">{children}</p>
  )
}

export function PlacementMark({
  value,
}: {
  value: "inbox" | "promotions" | "spam" | "missing" | undefined
}) {
  if (value === "inbox") {
    return <StatusBadge variant="ok">Inbox</StatusBadge>
  }
  if (value === "promotions") {
    return <StatusBadge variant="warn">Promotions</StatusBadge>
  }
  if (value === "spam") {
    return <StatusBadge variant="err">Spam</StatusBadge>
  }
  if (value === "missing") {
    return <StatusBadge variant="neutral">Missing</StatusBadge>
  }
  return <span className="text-fg-muted">—</span>
}

export function ListMark({
  value,
}: {
  value: "clean" | "listed" | "unknown" | null
}) {
  if (value === "clean") {
    return <StatusBadge variant="ok">Clean</StatusBadge>
  }
  if (value === "listed") {
    return <StatusBadge variant="err">Listed</StatusBadge>
  }
  if (value === "unknown") {
    return <StatusBadge variant="warn">Unknown</StatusBadge>
  }
  return <span className="text-fg-muted">—</span>
}
