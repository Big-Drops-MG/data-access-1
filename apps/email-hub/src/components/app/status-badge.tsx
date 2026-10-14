import { cn } from "@workspace/ui/lib/utils"

const variants = {
  neutral: "text-fg-muted",
  info: "text-info",
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  brand: "text-fg",
} as const

type StatusBadgeProps = {
  variant: keyof typeof variants
  children: React.ReactNode
  className?: string
}

export function StatusBadge({
  variant,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "status-badge inline-flex h-[22px] items-center gap-1.5 rounded-sm border px-2 text-caption font-medium whitespace-nowrap",
        variants[variant],
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      <span>{children}</span>
    </span>
  )
}
