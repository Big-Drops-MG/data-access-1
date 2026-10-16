"use client"

import { useId, useState } from "react"
import { CalendarIcon, ClockIcon } from "lucide-react"

import {
  formatEtDate,
  formatEtDateTime,
  formatEtTime,
  resolveEtWallTime,
} from "@workspace/shared"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

type EtDateTimePickerProps = {
  /** Controlled UTC instant (ISO string or Date). */
  value?: Date | string | null
  /** Called with a UTC Date once the Eastern wall time is resolved. */
  onChange: (utc: Date) => void
  dateLabel?: string
  timeLabel?: string
  disabled?: boolean
  className?: string
  "data-testid"?: string
}

type AmbiguousChoice = {
  earlier: Date
  later: Date
}

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0")
)
const MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0")
)

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseEtDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined
  }
  const [year, month, day] = value.split("-").map(Number)
  if (year == null || month == null || day == null) {
    return undefined
  }
  return new Date(year, month - 1, day)
}

function toEtDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatEtDateLabel(value: string): string {
  const date = parseEtDate(value)
  if (!date) {
    return ""
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function parseWall(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) {
    return null
  }
  const [year, month, day] = dateValue.split("-").map(Number)
  const [hour, minute] = timeValue.split(":").map(Number)
  if (
    year == null ||
    month == null ||
    day == null ||
    hour == null ||
    minute == null ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null
  }
  return { year, month, day, hour, minute, second: 0 }
}

/**
 * Eastern date + time inputs. Converts to UTC for the API (SD#12.7).
 * Rejects spring-forward gaps; asks which occurrence on fall-back overlaps.
 */
export function EtDateTimePicker({
  value = null,
  onChange,
  dateLabel = "Date (ET)",
  timeLabel = "Time (ET)",
  disabled = false,
  className,
  "data-testid": testId = "et-datetime-picker",
}: EtDateTimePickerProps) {
  const dateId = useId()
  const hourId = useId()
  const minuteId = useId()
  const validValue = toValidDate(value)
  const valueMs = validValue?.getTime() ?? null

  const [dateOpen, setDateOpen] = useState(false)
  const [draft, setDraft] = useState<{ date: string; time: string } | null>(
    null
  )
  const [draftForMs, setDraftForMs] = useState<number | null>(valueMs)
  const [error, setError] = useState<string | null>(null)
  const [ambiguous, setAmbiguous] = useState<AmbiguousChoice | null>(null)

  // Drop stale draft when the controlled UTC value changes (React prop→state sync).
  if (draftForMs !== valueMs) {
    setDraftForMs(valueMs)
    setDraft(null)
  }

  const dateValue = draft?.date ?? (validValue ? formatEtDate(validValue) : "")
  const timeValue = draft?.time ?? (validValue ? formatEtTime(validValue) : "")
  const selectedDate = parseEtDate(dateValue)
  const [hourValue, minuteValue] = (timeValue || ":").split(":")
  const hour = hourValue || ""
  const minute = minuteValue || ""

  function applyWall(nextDate: string, nextTime: string) {
    setDraft({ date: nextDate, time: nextTime })
    setError(null)

    const wall = parseWall(nextDate, nextTime)
    if (!wall) {
      return
    }

    const result = resolveEtWallTime(wall)
    if (result.status === "nonexistent") {
      setError(
        "That time does not exist in Eastern Time (spring forward). Choose another time."
      )
      return
    }
    if (result.status === "ambiguous") {
      setAmbiguous({ earlier: result.earlier, later: result.later })
      return
    }
    onChange(result.utc)
  }

  function chooseAmbiguous(instant: Date) {
    setAmbiguous(null)
    setError(null)
    onChange(instant)
  }

  function updateTimePart(nextHour: string, nextMinute: string) {
    if (!nextHour || !nextMinute) {
      setDraft({
        date: dateValue,
        time: nextHour || nextMinute ? `${nextHour}:${nextMinute}` : "",
      })
      return
    }
    applyWall(dateValue, `${nextHour}:${nextMinute}`)
  }

  return (
    <div className={cn("space-y-2", className)} data-testid={testId}>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <label htmlFor={dateId} className="text-sm font-medium text-fg">
            {dateLabel}
          </label>
          <Popover open={dateOpen} onOpenChange={setDateOpen} modal={false}>
            <PopoverTrigger
              render={
                <Button
                  id={dateId}
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  data-empty={!selectedDate}
                  data-testid={`${testId}-date`}
                  className="h-9 min-w-[12rem] justify-start gap-2 border-border-strong bg-surface px-3 font-normal text-fg data-[empty=true]:text-fg-muted"
                />
              }
            >
              <CalendarIcon
                className="size-4 text-fg-muted"
                strokeWidth={1.75}
              />
              {selectedDate ? formatEtDateLabel(dateValue) : "Pick a date"}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto overflow-visible p-0"
            >
              <Calendar
                mode="single"
                captionLayout="dropdown"
                selected={selectedDate}
                defaultMonth={selectedDate}
                onSelect={(date) => {
                  if (!date) {
                    return
                  }
                  applyWall(toEtDateString(date), timeValue)
                  setDateOpen(false)
                }}
                startMonth={new Date(2020, 0)}
                endMonth={new Date(2035, 11)}
              />
            </PopoverContent>
          </Popover>
        </div>

        <fieldset className="space-y-1.5 border-0 p-0">
          <legend className="text-sm font-medium text-fg">{timeLabel}</legend>
          <div className="flex items-center gap-2">
            <ClockIcon
              className="size-4 shrink-0 text-fg-muted"
              strokeWidth={1.75}
              aria-hidden
            />
            <Select
              value={hour || undefined}
              disabled={disabled}
              onValueChange={(next) => {
                if (next == null) {
                  return
                }
                updateTimePart(next, minute || "00")
              }}
            >
              <SelectTrigger
                id={hourId}
                size="default"
                className="h-9 min-w-[4.5rem] border-border-strong bg-surface"
                data-testid={`${testId}-hour`}
                aria-label="Hour (ET)"
              >
                <SelectValue placeholder="HH" />
              </SelectTrigger>
              <SelectContent className="z-[60] max-h-64 min-w-[4.5rem]">
                {HOURS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-fg-muted" aria-hidden>
              :
            </span>
            <Select
              value={minute || undefined}
              disabled={disabled}
              onValueChange={(next) => {
                if (next == null) {
                  return
                }
                updateTimePart(hour || "00", next)
              }}
            >
              <SelectTrigger
                id={minuteId}
                size="default"
                className="h-9 min-w-[4.5rem] border-border-strong bg-surface"
                data-testid={`${testId}-minute`}
                aria-label="Minute (ET)"
              >
                <SelectValue placeholder="MM" />
              </SelectTrigger>
              <SelectContent className="z-[60] max-h-64 min-w-[4.5rem]">
                {MINUTES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </fieldset>
      </div>

      {error ? (
        <p
          className="text-sm text-err"
          role="alert"
          data-testid={`${testId}-error`}
        >
          {error}
        </p>
      ) : null}

      {validValue && !error ? (
        <p className="text-sm text-fg-muted">
          UTC for API:{" "}
          <span className="font-mono text-caption text-fg">
            {validValue.toISOString()}
          </span>
        </p>
      ) : null}

      <AlertDialog
        open={ambiguous != null}
        onOpenChange={(open) => {
          if (!open) {
            setAmbiguous(null)
          }
        }}
      >
        <AlertDialogContent
          className="max-w-[560px] gap-6 p-6 data-[size=default]:max-w-[560px] sm:max-w-[560px] data-[size=default]:sm:max-w-[560px]"
          size="default"
          data-testid={`${testId}-ambiguous`}
        >
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-h3 font-semibold text-fg">
              Ambiguous Eastern time
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body text-fg-muted">
              That local time happens twice when clocks fall back. Choose which
              occurrence to use.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {ambiguous ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <AlertDialogAction
                className="justify-start"
                onClick={() => chooseAmbiguous(ambiguous.earlier)}
                data-testid={`${testId}-ambiguous-earlier`}
              >
                {formatEtDateTime(ambiguous.earlier)}
              </AlertDialogAction>
              <AlertDialogAction
                className="justify-start"
                variant="outline"
                onClick={() => chooseAmbiguous(ambiguous.later)}
                data-testid={`${testId}-ambiguous-later`}
              >
                {formatEtDateTime(ambiguous.later)}
              </AlertDialogAction>
            </div>
          ) : null}

          <AlertDialogFooter className="border-border bg-surface-2 sm:justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
