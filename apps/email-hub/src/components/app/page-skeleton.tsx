import { cn } from "@workspace/ui/lib/utils"

type PageSkeletonProps = {
  /** Number of skeleton rows (table-style). Default 5. */
  rows?: number
  /** Show a header block above the rows. */
  withHeader?: boolean
  className?: string
}

function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-2", className)}
      aria-hidden
    />
  )
}

/** Loading skeleton matching content size — no full-page spinner (SD#12.8). */
export function PageSkeleton({
  rows = 5,
  withHeader = true,
  className,
}: PageSkeletonProps) {
  return (
    <div
      className={cn("space-y-6", className)}
      data-testid="page-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {withHeader ? (
        <div className="space-y-2">
          <Bone className="h-8 w-56" />
          <Bone className="h-4 w-96 max-w-full" />
        </div>
      ) : null}
      <ul className="space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <li
            key={index}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3"
          >
            <Bone className="h-4 w-4 shrink-0 rounded-full" />
            <Bone className="h-4 flex-1" />
            <Bone className="h-4 w-20 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  )
}
