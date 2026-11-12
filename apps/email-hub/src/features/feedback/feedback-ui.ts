import { cn } from "@workspace/ui/lib/utils"

export const feedbackControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function feedbackOutlineControl(className?: string) {
  return cn(
    feedbackControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function feedbackPrimaryControl(className?: string) {
  return cn(
    feedbackControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export const feedbackSectionClass =
  "space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-7"

export const feedbackSelectTriggerClass =
  "flex h-11 w-full min-w-0 items-center justify-between rounded-lg border border-border-strong bg-surface px-3.5 text-[15px] leading-none text-fg shadow-none outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] data-placeholder:text-fg-muted disabled:opacity-50 data-[size=default]:h-11"

export const feedbackSelectContentClass =
  "z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-fg shadow-lg"

export const feedbackSelectItemClass =
  "min-h-10 cursor-pointer rounded-lg px-3 py-2.5 text-body text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"
