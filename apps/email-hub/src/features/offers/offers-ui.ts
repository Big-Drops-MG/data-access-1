import { cn } from "@workspace/ui/lib/utils"

const offersControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function offersOutlineControl(className?: string) {
  return cn(
    offersControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function offersPrimaryControl(className?: string) {
  return cn(
    offersControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}
