import { cn } from "@workspace/ui/lib/utils"

const controlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function apiClientsOutlineControl(className?: string) {
  return cn(
    controlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function apiClientsPrimaryControl(className?: string) {
  return cn(
    controlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export const apiClientsFieldControlClass =
  "h-11 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-destructive disabled:opacity-50"
