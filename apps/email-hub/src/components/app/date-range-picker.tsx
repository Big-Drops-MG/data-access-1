"use client"

import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "last_week"
  | "this_month"
  | "last_month"
  | "all_time"
  | "custom"

export type DateRangeSelection = {
  preset: DateRangePreset
  from: string
  to: string
  label: string
}

const PRESET_OPTIONS: ReadonlyArray<{
  id: Exclude<DateRangePreset, "custom">
  label: string
}> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "last_week", label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "all_time", label: "All Time" },
]

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const

const MONTH_LABEL_FMT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const COMPACT_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

export function todayEtIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function parseIsoUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function toIsoUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftDays(iso: string, delta: number): string {
  const d = parseIsoUtc(iso)
  d.setUTCDate(d.getUTCDate() + delta)
  return toIsoUtc(d)
}

function inclusiveDays(from: string, to: string): number {
  const diff = parseIsoUtc(to).getTime() - parseIsoUtc(from).getTime()
  return Math.floor(diff / 86_400_000) + 1
}

function formatCustomLabel(from: string, to: string): string {
  if (from === to) {
    return SHORT_DATE_FMT.format(parseIsoUtc(from))
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  if (sameYear) {
    return `${COMPACT_DATE_FMT.format(parseIsoUtc(from))} – ${COMPACT_DATE_FMT.format(parseIsoUtc(to))}`
  }
  return `${SHORT_DATE_FMT.format(parseIsoUtc(from))} – ${SHORT_DATE_FMT.format(parseIsoUtc(to))}`
}

export function resolveDateRangePreset(
  preset: Exclude<DateRangePreset, "custom">,
  maxDays = 1095,
  now = new Date()
): DateRangeSelection {
  const today = todayEtIso(now)
  const todayDate = parseIsoUtc(today)
  const label =
    PRESET_OPTIONS.find((item) => item.id === preset)?.label ?? "Last 7 Days"

  if (preset === "today") {
    return { preset, from: today, to: today, label }
  }
  if (preset === "yesterday") {
    const y = shiftDays(today, -1)
    return { preset, from: y, to: y, label }
  }
  if (preset === "this_week") {
    const dow = todayDate.getUTCDay()
    return { preset, from: shiftDays(today, -dow), to: today, label }
  }
  if (preset === "last_7_days") {
    return { preset, from: shiftDays(today, -6), to: today, label }
  }
  if (preset === "last_week") {
    const dow = todayDate.getUTCDay()
    const lastSat = shiftDays(today, -(dow + 1))
    const lastSun = shiftDays(lastSat, -6)
    return { preset, from: lastSun, to: lastSat, label }
  }
  if (preset === "this_month") {
    const first = `${today.slice(0, 7)}-01`
    return { preset, from: first, to: today, label }
  }
  if (preset === "last_month") {
    const firstOfThisMonth = new Date(
      Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1)
    )
    const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 86_400_000)
    const firstOfPrevMonth = new Date(
      Date.UTC(
        lastOfPrevMonth.getUTCFullYear(),
        lastOfPrevMonth.getUTCMonth(),
        1
      )
    )
    return {
      preset,
      from: toIsoUtc(firstOfPrevMonth),
      to: toIsoUtc(lastOfPrevMonth),
      label,
    }
  }
  return {
    preset: "all_time",
    from: shiftDays(today, -(maxDays - 1)),
    to: today,
    label,
  }
}

function buildMonthGrid(year: number, month: number): Array<string | null> {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: Array<string | null> = []
  for (let i = 0; i < firstDow; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const mm = String(month + 1).padStart(2, "0")
    const dd = String(day).padStart(2, "0")
    cells.push(`${year}-${mm}-${dd}`)
  }
  return cells
}

function MonthCalendar({
  year,
  month,
  today,
  draftStart,
  draftEnd,
  onSelectDay,
}: {
  year: number
  month: number
  today: string
  draftStart: string | null
  draftEnd: string | null
  onSelectDay: (iso: string) => void
}) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])
  const rangeStart =
    draftStart && draftEnd
      ? draftStart <= draftEnd
        ? draftStart
        : draftEnd
      : draftStart
  const rangeEnd =
    draftStart && draftEnd
      ? draftStart <= draftEnd
        ? draftEnd
        : draftStart
      : null

  return (
    <div className="w-[244px]">
      <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-medium text-fg-muted">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {cells.map((iso, index) => {
          if (!iso) {
            return <span key={`empty-${index}`} className="h-8" />
          }
          const isFuture = iso > today
          const isToday = iso === today
          const isStart = rangeStart === iso
          const isEnd = rangeEnd === iso
          const isSelected = isStart || isEnd
          const isInRange =
            Boolean(rangeStart && rangeEnd) &&
            iso > rangeStart! &&
            iso < rangeEnd!

          return (
            <button
              key={iso}
              type="button"
              disabled={isFuture}
              onClick={() => onSelectDay(iso)}
              className={cn(
                "mx-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-xs transition-colors outline-none focus-visible:shadow-[0_0_0_2px_var(--ring)]",
                isFuture && "cursor-not-allowed text-fg-muted/35",
                !isFuture &&
                  !isSelected &&
                  !isInRange &&
                  "text-fg hover:bg-surface-2",
                isInRange && "bg-surface-2 text-fg",
                isSelected && "bg-fg font-semibold text-bg",
                isToday && !isSelected && "border border-fg font-semibold"
              )}
            >
              {Number(iso.slice(8, 10))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangePicker({
  value,
  onChange,
  maxDays = 1095,
  testId = "reports-range",
}: {
  value: DateRangeSelection
  onChange: (next: DateRangeSelection) => void
  maxDays?: number
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"presets" | "custom">("presets")
  const [draftStart, setDraftStart] = useState<string | null>(null)
  const [draftEnd, setDraftEnd] = useState<string | null>(null)

  const today = useMemo(() => todayEtIso(), [])
  const todayDate = useMemo(() => parseIsoUtc(today), [today])

  const [rightMonth, setRightMonth] = useState<{ year: number; month: number }>(
    () => ({
      year: todayDate.getUTCFullYear(),
      month: todayDate.getUTCMonth(),
    })
  )

  const leftMonth = useMemo(() => {
    const d = new Date(Date.UTC(rightMonth.year, rightMonth.month - 1, 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
  }, [rightMonth])

  const canGoNext =
    rightMonth.year < todayDate.getUTCFullYear() ||
    (rightMonth.year === todayDate.getUTCFullYear() &&
      rightMonth.month < todayDate.getUTCMonth())

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(rightMonth.year, rightMonth.month + delta, 1))
    setRightMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setView("presets")
    }
  }

  function openCustom() {
    setDraftStart(value.preset === "custom" ? value.from : null)
    setDraftEnd(value.preset === "custom" ? value.to : null)
    setRightMonth({
      year: todayDate.getUTCFullYear(),
      month: todayDate.getUTCMonth(),
    })
    setView("custom")
  }

  function handleSelectDay(iso: string) {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(iso)
      setDraftEnd(null)
      return
    }
    if (iso < draftStart) {
      setDraftEnd(draftStart)
      setDraftStart(iso)
      return
    }
    setDraftEnd(iso)
  }

  const orderedFrom =
    draftStart && draftEnd
      ? draftStart <= draftEnd
        ? draftStart
        : draftEnd
      : draftStart
  const orderedTo =
    draftStart && draftEnd
      ? draftStart <= draftEnd
        ? draftEnd
        : draftStart
      : null
  const daySpan =
    orderedFrom && orderedTo ? inclusiveDays(orderedFrom, orderedTo) : 0
  const exceedsMax = daySpan > maxDays
  const canApply = Boolean(orderedFrom && orderedTo && !exceedsMax)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        aria-label="Date range"
        data-testid={testId}
        className="inline-flex h-9 min-w-[11rem] items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-fg transition-colors outline-none hover:bg-surface-2 focus-visible:shadow-[0_0_0_3px_var(--ring)]"
      >
        <span className="truncate">{value.label}</span>
        <ChevronDown
          className="size-4 shrink-0 text-fg-muted"
          strokeWidth={1.75}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className={cn(
          "rounded-xl border border-border bg-surface p-0 text-fg shadow-md",
          view === "presets" ? "w-52 p-1.5" : "w-auto"
        )}
      >
        {view === "presets" ? (
          <ul role="menu" className="space-y-0.5">
            {PRESET_OPTIONS.map((option) => {
              const selected = value.preset === option.id
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      onChange(resolveDateRangePreset(option.id, maxDays))
                      setOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-surface-2 focus-visible:bg-surface-2",
                      selected ? "font-medium text-fg" : "text-fg"
                    )}
                  >
                    <span>{option.label}</span>
                    {selected ? (
                      <Check
                        className="size-4 text-fg"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
            <li className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={openCustom}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-fg transition-colors outline-none hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                <span>Custom Range</span>
                {value.preset === "custom" ? (
                  <Check
                    className="size-4 text-fg"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          </ul>
        ) : (
          <div>
            <div className="p-4">
              <div className="mb-3 grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => shiftMonth(-1)}
                  className="inline-flex size-7 items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-2"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <p className="text-center text-sm font-semibold text-fg">
                  {MONTH_LABEL_FMT.format(
                    new Date(Date.UTC(leftMonth.year, leftMonth.month, 1))
                  )}
                </p>
                <p className="text-center text-sm font-semibold text-fg">
                  {MONTH_LABEL_FMT.format(
                    new Date(Date.UTC(rightMonth.year, rightMonth.month, 1))
                  )}
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={!canGoNext}
                  onClick={() => shiftMonth(1)}
                  className="inline-flex size-7 items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-35"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>

              <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
                <MonthCalendar
                  year={leftMonth.year}
                  month={leftMonth.month}
                  today={today}
                  draftStart={draftStart}
                  draftEnd={draftEnd}
                  onSelectDay={handleSelectDay}
                />
                <MonthCalendar
                  year={rightMonth.year}
                  month={rightMonth.month}
                  today={today}
                  draftStart={draftStart}
                  draftEnd={draftEnd}
                  onSelectDay={handleSelectDay}
                />
              </div>
            </div>

            <footer className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
              <p
                className={cn(
                  "text-xs",
                  exceedsMax ? "text-err" : "text-fg-muted"
                )}
              >
                {exceedsMax
                  ? `Range cannot exceed ${maxDays} days (${daySpan} selected)`
                  : orderedFrom && orderedTo
                    ? `${SHORT_DATE_FMT.format(parseIsoUtc(orderedFrom))} – ${SHORT_DATE_FMT.format(parseIsoUtc(orderedTo))}`
                    : orderedFrom
                      ? `${SHORT_DATE_FMT.format(parseIsoUtc(orderedFrom))} – Select end date`
                      : "Select a start and end date"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView("presets")}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!canApply}
                  onClick={() => {
                    if (!orderedFrom || !orderedTo || exceedsMax) {
                      return
                    }
                    onChange({
                      preset: "custom",
                      from: orderedFrom,
                      to: orderedTo,
                      label: formatCustomLabel(orderedFrom, orderedTo),
                    })
                    setOpen(false)
                    setView("presets")
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-fg px-3 text-xs font-medium text-bg transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </footer>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
