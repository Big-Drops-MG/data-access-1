import { cn } from "@workspace/ui/lib/utils"

export const emailRoutesControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function emailRoutesOutlineControl(className?: string) {
  return cn(
    emailRoutesControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function emailRoutesPrimaryControl(className?: string) {
  return cn(
    emailRoutesControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export const emailRoutesSelectTriggerClass =
  "flex h-11 w-full min-w-0 max-w-full items-center justify-between overflow-hidden rounded-lg border border-border-strong bg-surface px-3.5 text-sm leading-none text-fg shadow-none outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] data-placeholder:text-fg-muted aria-[invalid=true]:border-destructive disabled:opacity-50 data-[size=default]:h-11 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"

export const emailRoutesSelectContentClass =
  "z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-fg shadow-lg"

export const emailRoutesSelectItemClass =
  "min-h-10 cursor-pointer rounded-lg px-3 py-2.5 text-body whitespace-normal text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"
