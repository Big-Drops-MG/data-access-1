"use client"

import { useId, useState } from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

type EtDatePickerProps = {
  value?: string
  onChange: (etDate: string) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Applied to the trigger button (height, radius, border). */
  triggerClassName?: string
  labelClassName?: string
  id?: string
  "data-testid"?: string
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

/**
 * Date-only picker in Eastern calendar days (`YYYY-MM-DD`).
 * No wall-clock conversion — use EtDateTimePicker when time matters.
 */
export function EtDatePicker({
  value = "",
  onChange,
  label = "Date (ET)",
  placeholder = "Pick a date",
  disabled = false,
  className,
  triggerClassName,
  labelClassName,
  id: idProp,
  "data-testid": testId = "et-date-picker",
}: EtDatePickerProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const [open, setOpen] = useState(false)
  const selected = parseEtDate(value)

  return (
    <div className={cn("grid grid-rows-[1rem_2.25rem] gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "flex h-4 items-center text-caption leading-none font-medium text-fg-muted",
          labelClassName
        )}
      >
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              data-empty={!selected}
              data-testid={testId}
              className={cn(
                "h-9 w-full justify-start gap-2 rounded-md border-border bg-surface px-3 font-normal text-fg shadow-none hover:bg-surface data-[empty=true]:text-fg-muted",
                triggerClassName
              )}
            />
          }
        >
          <CalendarIcon className="size-4 text-fg-muted" strokeWidth={1.75} />
          {selected ? formatEtDateLabel(value) : placeholder}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto overflow-visible p-0">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) {
                return
              }
              onChange(toEtDateString(date))
              setOpen(false)
            }}
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
