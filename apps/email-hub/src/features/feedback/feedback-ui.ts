import { cn } from "@workspace/ui/lib/utils"

export const feedbackControlBase =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-4 text-[13px] leading-none font-medium tracking-tight transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

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
    "border-primary bg-primary text-on-primary hover:bg-primary-hover hover:text-on-primary",
    className
  )
}

export const feedbackCardClass =
  "overflow-hidden rounded-lg border border-border bg-surface"

export const feedbackCardHeaderClass =
  "border-b border-border bg-surface-2 px-5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase"

export const feedbackCardBodyClass = "space-y-0 px-5 py-1"

export const feedbackDecisionPanelClass =
  "space-y-5 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-6"

export const feedbackSelectTriggerClass =
  "flex h-10 w-full min-w-0 items-center justify-between rounded-md border border-border bg-surface px-3 text-[14px] leading-none text-fg shadow-none outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] data-placeholder:text-fg-muted disabled:opacity-50 data-[size=default]:h-10"

export const feedbackSelectContentClass =
  "z-50 overflow-hidden rounded-lg border border-border bg-surface p-1 text-fg shadow-lg"

export const feedbackSelectItemClass =
  "min-h-9 cursor-pointer rounded-md px-3 py-2 text-[14px] text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"

export function feedbackDecisionOptionClass(selected: boolean) {
  return cn(
    "flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors",
    selected
      ? "border-accent/50 bg-accent/5"
      : "border-border bg-surface hover:bg-surface-2/60"
  )
}
