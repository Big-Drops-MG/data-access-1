import { cn } from "@workspace/ui/lib/utils"

export const auditLogFieldControlClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:opacity-50"

export const auditLogSelectTriggerClass =
  "flex h-9 w-full min-w-0 items-center justify-between rounded-md border border-border bg-surface px-3 text-sm text-fg shadow-none outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] data-placeholder:text-fg-muted data-[size=default]:h-9"

export const auditLogSelectContentClass =
  "z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-fg shadow-lg"

export const auditLogSelectItemClass =
  "min-h-9 cursor-pointer rounded-lg px-3 py-2 text-sm text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"

export function auditLogFilterLabelClass(className?: string) {
  return cn("text-caption font-medium text-fg-muted", className)
}
