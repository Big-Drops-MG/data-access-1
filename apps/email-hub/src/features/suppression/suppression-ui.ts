import { cn } from "@workspace/ui/lib/utils"

export const suppressionControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function suppressionOutlineControl(className?: string) {
  return cn(
    suppressionControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function suppressionPrimaryControl(className?: string) {
  return cn(
    suppressionControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export const suppressionFieldControlClass =
  "h-11 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-sm leading-none text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-destructive disabled:opacity-50"

export const suppressionSelectTriggerClass =
  "flex h-11 w-full min-w-0 items-center justify-between rounded-lg border border-border-strong bg-surface px-3.5 text-sm leading-none text-fg shadow-none outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] data-placeholder:text-fg-muted aria-[invalid=true]:border-destructive disabled:opacity-50 data-[size=default]:h-11"

export const suppressionSelectContentClass =
  "z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-fg shadow-lg"

export const suppressionSelectItemClass =
  "min-h-10 cursor-pointer rounded-lg px-3 py-2.5 text-body text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"

export const suppressionTextareaClass =
  "min-h-24 w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-destructive disabled:opacity-50"
