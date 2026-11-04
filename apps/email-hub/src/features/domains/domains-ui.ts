import { cn } from "@workspace/ui/lib/utils"

/** Shared Domains control language (chips / Add domain / detail actions). */
export const domainsControlBase =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

export function domainsOutlineControl(className?: string) {
  return cn(
    domainsControlBase,
    "border-border bg-surface text-fg hover:bg-surface-2",
    className
  )
}

export function domainsPrimaryControl(className?: string) {
  return cn(
    domainsControlBase,
    "border-fg bg-fg text-bg hover:bg-fg/90 hover:text-bg",
    className
  )
}

export function domainsDangerControl(className?: string) {
  return cn(
    domainsControlBase,
    "border-err/20 bg-err text-surface hover:bg-err/90",
    className
  )
}

export function domainsIconControl(className?: string) {
  return cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-transparent text-fg-muted transition-[color,background-color,border-color] duration-150 outline-none hover:border-border hover:bg-surface-2 hover:text-fg focus-visible:shadow-[0_0_0_3px_var(--ring)]",
    className
  )
}
