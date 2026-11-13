import { cn } from "@workspace/ui/lib/utils"

export const templatesControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function templatesOutlineControl(className?: string) {
  return cn(
    templatesControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function templatesPrimaryControl(className?: string) {
  return cn(
    templatesControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export const templatesFieldControlClass =
  "h-12 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-[15px] leading-none text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-destructive disabled:opacity-50"

export const templatesTextareaClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-3.5 font-mono text-[13px] leading-relaxed text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] aria-[invalid=true]:border-destructive disabled:opacity-50"

/** Label → control gap; also overrides FormField’s default `[&_input]:h-9`. */
export const templatesFieldStackClass =
  "gap-4 [&_input]:h-12 [&_input]:rounded-lg [&_input]:px-3.5 [&_input]:text-[15px]"

export const templatesSectionClass =
  "space-y-7 rounded-xl border border-border bg-surface p-7 shadow-sm sm:p-8"

export const templatesSelectTriggerClass =
  "flex h-12 w-full min-w-0 items-center justify-between rounded-lg border border-border-strong bg-surface px-3.5 text-[15px] leading-none text-fg shadow-none outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] data-placeholder:text-fg-muted aria-[invalid=true]:border-destructive disabled:opacity-50 data-[size=default]:h-12"

export const templatesSelectContentClass =
  "z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-fg shadow-lg"

export const templatesSelectItemClass =
  "min-h-10 cursor-pointer rounded-lg px-3 py-2.5 text-body text-fg outline-none focus:bg-surface-2 focus:text-fg data-[highlighted]:bg-surface-2"
