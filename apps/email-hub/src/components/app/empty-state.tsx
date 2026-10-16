import { cn } from "@workspace/ui/lib/utils"

type EmptyStateProps = {
  title: string
  description: string
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-md border border-border bg-surface px-6 py-16 text-center",
        className
      )}
      data-testid="empty-state"
      aria-label={title}
    >
      {icon ? <div className="text-fg-muted [&_svg]:size-5">{icon}</div> : null}
      <div className="max-w-md space-y-1">
        <h2 className="text-h4 font-semibold text-fg">{title}</h2>
        <p className="text-body text-fg-muted">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  )
}
