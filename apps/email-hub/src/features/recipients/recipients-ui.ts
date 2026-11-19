import { cn } from "@workspace/ui/lib/utils"

export const recipientsFieldControlClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:opacity-50"

export const recipientsOutlineControl =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-fg transition-colors outline-none hover:bg-surface-2 focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"

export const recipientsPrimaryControl =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-fg bg-fg px-3.5 text-sm font-medium text-bg transition-colors outline-none hover:bg-fg/90 focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"

export function recipientsTabClass(active: boolean, className?: string) {
  return cn(
    "relative inline-flex items-center border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors outline-none",
    active
      ? "border-fg text-fg"
      : "border-transparent text-fg-muted hover:text-fg",
    className
  )
}
