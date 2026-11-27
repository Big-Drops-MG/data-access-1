"use client"

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCount, formatPercent } from "@/features/reports/reports-widgets"

const TEAL_BAR = "#0097a7"
const APPLE_BAR = "#c25e1a"

const DEFAULT_FREQUENCY_LABELS = [
  "Opened once",
  "2 times",
  "3 times",
  "4 times",
  "5 times",
  "6 or more",
] as const

const DEFAULT_CLIENT_LABELS = [
  "Apple Mail",
  "Gmail",
  "Outlook",
  "Yahoo Mail",
  "Other",
] as const

type FrequencyRow = {
  label: string
  recipients: number
}

type ClientRow = {
  label: string
  opens: number
  share: number
}

function ClientYAxisTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value?: string }
}) {
  const label = String(payload?.value ?? "")
  const isApple = label.toLowerCase().includes("apple")
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={isApple ? -4 : 4}
        textAnchor="start"
        fill="var(--fg)"
        fontSize={12}
      >
        {label}
      </text>
      {isApple ? (
        <g transform="translate(0, 4)">
          <rect
            x={0}
            y={0}
            width={82}
            height={16}
            rx={4}
            fill="var(--surface-2)"
          />
          <text x={6} y={11.5} fill="var(--fg-muted)" fontSize={10}>
            machine opens
          </text>
        </g>
      ) : null}
    </g>
  )
}

export function OpenFrequencyChart({
  rows,
  includeMachine = false,
  testId = "reports-open-frequency",
}: {
  rows: FrequencyRow[]
  includeMachine?: boolean
  testId?: string
}) {
  const data =
    rows.length > 0
      ? rows.map((row) => ({
          label: row.label,
          value: row.recipients,
          display: formatCount(row.recipients),
        }))
      : DEFAULT_FREQUENCY_LABELS.map((label) => ({
          label,
          value: 0,
          display: "0",
        }))

  const max = Math.max(0, ...data.map((row) => row.value))
  const chartHeight = Math.max(210, data.length * 38)

  return (
    <section
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
      data-testid={testId}
    >
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">
          How many times people opened
        </h2>
        <span className="text-[12px] text-fg-muted">
          {includeMachine
            ? "Unique recipients, Apple Mail included"
            : "Unique recipients, Apple Mail excluded"}
        </span>
      </header>

      <div
        className="w-full flex-1 px-4 py-3"
        style={{ minHeight: chartHeight }}
        role="img"
        aria-label="How many times people opened horizontal bar chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, left: 0, bottom: 4 }}
            barSize={10}
          >
            <XAxis type="number" hide domain={[0, max > 0 ? max : 10]} />
            <YAxis
              type="category"
              dataKey="label"
              width={104}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--fg)", fontSize: 12 }}
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
              formatter={(value) => [
                formatCount(typeof value === "number" ? value : Number(value)),
                "Recipients",
              ]}
            />
            <Bar
              dataKey="value"
              fill={TEAL_BAR}
              radius={[6, 6, 6, 6]}
              minPointSize={max > 0 ? 4 : 0}
            >
              <LabelList
                dataKey="display"
                position="right"
                offset={12}
                style={{
                  fill: "var(--fg)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function EmailClientChart({
  rows,
  testId = "reports-email-client",
}: {
  rows: ClientRow[]
  testId?: string
}) {
  const data =
    rows.length > 0
      ? rows.map((row) => ({
          label: row.label,
          value: row.share * 100,
          opens: row.opens,
          display: formatPercent(row.share, 1),
          isApple: row.label.toLowerCase().includes("apple"),
        }))
      : DEFAULT_CLIENT_LABELS.map((label) => ({
          label,
          value: 0,
          opens: 0,
          display: "0.0%",
          isApple: label === "Apple Mail",
        }))

  const max = Math.max(0, ...data.map((row) => row.value))
  const chartHeight = Math.max(220, data.length * 40)

  return (
    <section
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
      data-testid={testId}
    >
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Email client</h2>
      </header>

      <div
        className="w-full flex-1 px-4 pt-3 pb-2"
        style={{ minHeight: chartHeight }}
        role="img"
        aria-label="Email client share horizontal bar chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, left: 0, bottom: 4 }}
            barSize={10}
          >
            <XAxis type="number" hide domain={[0, max > 0 ? max : 100]} />
            <YAxis
              type="category"
              dataKey="label"
              width={108}
              axisLine={false}
              tickLine={false}
              tick={(props) => (
                <ClientYAxisTick
                  x={0}
                  y={Number(props.y ?? 0)}
                  payload={props.payload as { value?: string }}
                />
              )}
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
              formatter={(_value, _name, item) => {
                const payload = item?.payload as
                  { display?: string; opens?: number } | undefined
                return [
                  `${payload?.display ?? "0.0%"} (${formatCount(payload?.opens ?? 0)} opens)`,
                  "Share",
                ]
              }}
            />
            <Bar
              dataKey="value"
              radius={[6, 6, 6, 6]}
              minPointSize={max > 0 ? 4 : 0}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={entry.isApple ? APPLE_BAR : TEAL_BAR}
                />
              ))}
              <LabelList
                dataKey="display"
                position="right"
                offset={12}
                style={{
                  fill: "var(--fg)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="px-4 pb-4 text-[12px] text-fg-muted">
        Apple Mail Privacy Protection loads every image on delivery. These opens
        are kept out of the open rate.
      </p>
    </section>
  )
}
