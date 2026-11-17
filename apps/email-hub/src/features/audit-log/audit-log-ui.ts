import { cn } from "@workspace/ui/lib/utils"

/** Shared height/radius/border for every audit filter control. */
export const auditLogControlShellClass =
  "h-9 w-full min-w-0 rounded-md border border-border bg-surface text-sm text-fg shadow-none outline-none"

export const auditLogFieldControlClass = cn(
  auditLogControlShellClass,
  "px-3 placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:opacity-50"
)

export const auditLogSelectTriggerClass = cn(
  auditLogControlShellClass,
  "flex items-center justify-between gap-1.5 px-3 focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:opacity-50 data-placeholder:text-fg-muted data-[size=default]:h-9 data-[size=sm]:h-9"
)

export const auditLogDateTriggerClass = cn(
  auditLogControlShellClass,
  "justify-start gap-2 px-3 font-normal hover:bg-surface data-[empty=true]:text-fg-muted"
)

export const auditLogClearButtonClass = cn(
  auditLogControlShellClass,
  "inline-flex items-center justify-center px-3 font-medium hover:bg-surface-2 disabled:opacity-40"
)

export const auditLogSelectContentClass =
  "z-50 overflow-hidden rounded-md border border-border bg-surface p-1.5 text-fg shadow-lg"

export const auditLogSelectItemClass =
  "min-h-9 cursor-pointer rounded-md px-3 py-2 text-sm text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"

export function auditLogFilterLabelClass(className?: string) {
  return cn(
    "flex h-4 items-center text-caption leading-none font-medium text-fg-muted",
    className
  )
}

export function auditLogFilterFieldClass(className?: string) {
  return cn("grid shrink-0 grid-rows-[1rem_2.25rem] gap-1.5", className)
}
