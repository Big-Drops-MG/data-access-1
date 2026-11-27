"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCount } from "@/features/reports/reports-widgets"

const DELIVERED_COLOR = "#00acc1"
const BOUNCED_COLOR = "#ef4444"

const shortDayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

const shortMonthFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
})

export type DeliveredBouncedRow = {
  day: string
  label: string
  delivered: number
  bounced: number
}

type Granularity = "day" | "week" | "month"

type BucketPoint = {
  key: string
  label: string
  delivered: number
  bounced: number
}

function weekStartIso(date: Date): string {
  const start = new Date(date)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  return start.toISOString().slice(0, 10)
}

function chooseGranularity(days: number): Granularity {
  if (days <= 31) {
    return "day"
  }
  if (days <= 180) {
    return "week"
  }
  return "month"
}

function buildBucketedSeries(
  rows: DeliveredBouncedRow[],
  from: string,
  to: string
): { granularity: Granularity; points: BucketPoint[] } {
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return {
      granularity: "day",
      points: rows.map((row) => ({
        key: row.day,
        label: row.label,
        delivered: row.delivered,
        bounced: row.bounced,
      })),
    }
  }

  const totalDays =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  const granularity = chooseGranularity(totalDays)

  const buckets = new Map<string, BucketPoint>()

  if (granularity === "day") {
    const cursor = new Date(start)
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10)
      buckets.set(key, {
        key,
        label: shortDayFmt.format(cursor),
        delivered: 0,
        bounced: 0,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    for (const row of rows) {
      const bucket = buckets.get(row.day)
      if (bucket) {
        bucket.delivered += row.delivered
        bucket.bounced += row.bounced
      }
    }
  } else if (granularity === "week") {
    const cursor = new Date(`${weekStartIso(start)}T00:00:00Z`)
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10)
      buckets.set(key, {
        key,
        label: shortDayFmt.format(cursor),
        delivered: 0,
        bounced: 0,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 7)
    }
    for (const row of rows) {
      const rowDate = new Date(`${row.day}T00:00:00Z`)
      if (Number.isNaN(rowDate.getTime())) {
        continue
      }
      const key = weekStartIso(rowDate)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.delivered += row.delivered
        bucket.bounced += row.bounced
      }
    }
  } else {
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
    )
    const endMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
    )
    while (cursor <= endMonth) {
      const key = cursor.toISOString().slice(0, 7)
      buckets.set(key, {
        key,
        label: shortMonthFmt.format(cursor),
        delivered: 0,
        bounced: 0,
      })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    for (const row of rows) {
      const key = row.day.slice(0, 7)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.delivered += row.delivered
        bucket.bounced += row.bounced
      }
    }
  }

  return {
    granularity,
    points: [...buckets.values()],
  }
}

export function DeliveredBouncedChart({
  rows,
  from,
  to,
  rangeLabel,
  testId = "reports-send-chart",
}: {
  rows: DeliveredBouncedRow[]
  from: string
  to: string
  rangeLabel: string
  testId?: string
}) {
  const { granularity, points: data } = useMemo(
    () => buildBucketedSeries(rows, from, to),
    [rows, from, to]
  )
  const hasNonZero = data.some((row) => row.delivered > 0 || row.bounced > 0)

  const xTicks = useMemo(() => {
    const count = data.length
    if (count <= 10) {
      return undefined
    }
    const targetTicks = 7
    const step = Math.max(1, Math.ceil((count - 1) / (targetTicks - 1)))
    const ticks: string[] = []
    for (let i = 0; i < count; i += step) {
      const item = data[i]
      if (item) {
        ticks.push(item.label)
      }
    }
    const last = data[count - 1]
    if (last && ticks[ticks.length - 1] !== last.label) {
      if (
        ticks.length > 1 &&
        count - 1 - (ticks.length - 1) * step < step / 2
      ) {
        ticks[ticks.length - 1] = last.label
      } else {
        ticks.push(last.label)
      }
    }
    return ticks
  }, [data])

  const barSize = data.length <= 14 ? 26 : data.length <= 28 ? 18 : 12
  const heading =
    granularity === "day"
      ? "Delivered and bounced per day"
      : granularity === "week"
        ? "Delivered and bounced per week"
        : "Delivered and bounced per month"

  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-surface p-5"
      data-testid={testId}
    >
      <header className="mb-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <h2 className="text-sm font-semibold text-fg">{heading}</h2>
        <div className="flex items-center gap-4 text-[12px] text-fg-muted sm:justify-center">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ backgroundColor: DELIVERED_COLOR }}
              aria-hidden
            />
            Delivered
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ backgroundColor: BOUNCED_COLOR }}
              aria-hidden
            />
            Bounced
          </span>
        </div>
        <p className="text-[12px] text-fg-muted sm:justify-self-end">
          {rangeLabel}
        </p>
      </header>

      <div
        className="h-[260px] w-full rounded-lg bg-surface-2/40 pt-3 pr-3 pb-1"
        role="img"
        aria-label={`${heading} stacked bar chart`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            barSize={barSize}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeOpacity={0.6}
            />
            <XAxis
              dataKey="label"
              ticks={xTicks}
              interval={0}
              axisLine={false}
              tickLine={false}
              dy={8}
              padding={{ left: 8, right: 8 }}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={hasNonZero ? [0, "auto"] : [0, 10]}
              ticks={hasNonZero ? undefined : [0, 5, 10]}
              width={42}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickFormatter={(value: number) => formatCount(value)}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)", opacity: 0.45 }}
              contentStyle={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--fg)",
              }}
              labelStyle={{
                fontWeight: 600,
                marginBottom: "4px",
                color: "var(--fg)",
              }}
              formatter={(value, name) => [
                formatCount(typeof value === "number" ? value : Number(value)),
                String(name),
              ]}
            />
            <Bar
              dataKey="delivered"
              name="Delivered"
              stackId="daily"
              fill={DELIVERED_COLOR}
            />
            <Bar
              dataKey="bounced"
              name="Bounced"
              stackId="daily"
              fill={BOUNCED_COLOR}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
