import { cn } from "@workspace/ui/lib/utils"

export const sendsControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function sendsOutlineControl(className?: string) {
  return cn(
    sendsControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function sendsPrimaryControl(className?: string) {
  return cn(
    sendsControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export function sendsDestructiveControl(className?: string) {
  return cn(
    sendsControlBase,
    "border-destructive/40 bg-surface text-destructive hover:bg-destructive/10",
    className
  )
}

export const sendsFieldControlClass =
  "h-12 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-[15px] leading-none text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-destructive disabled:opacity-50"

/** Label → control gap; also overrides FormField’s default `[&_input]:h-9`. */
export const sendsFieldStackClass =
  "gap-4 [&_input]:h-12 [&_input]:rounded-lg [&_input]:px-3.5 [&_input]:text-[15px]"

export const sendsSectionClass =
  "space-y-7 rounded-xl border border-border bg-surface p-7 shadow-sm sm:p-8"

export const sendsSelectTriggerClass =
  "flex h-12 w-full min-w-0 items-center justify-between rounded-lg border border-border-strong bg-surface px-3.5 text-[15px] leading-none text-fg shadow-none outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] data-placeholder:text-fg-muted aria-[invalid=true]:border-destructive disabled:opacity-50 data-[size=default]:h-12"

export const sendsSelectContentClass =
  "z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-fg shadow-lg"

export const sendsSelectItemClass =
  "min-h-10 cursor-pointer rounded-lg px-3 py-2.5 text-body text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"
