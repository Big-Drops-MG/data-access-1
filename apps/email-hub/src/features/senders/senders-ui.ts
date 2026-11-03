import { cn } from "@workspace/ui/lib/utils"

export const sendersControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function sendersOutlineControl(className?: string) {
  return cn(
    sendersControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function sendersPrimaryControl(className?: string) {
  return cn(
    sendersControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export const sendersFieldControlClass =
  "h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-destructive disabled:opacity-50"
