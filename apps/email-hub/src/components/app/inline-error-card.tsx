"use client"

import { AlertCircle } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type InlineErrorCardProps = {
  title?: string
  message?: string
  /** Request / correlation id from the API (SD#12.8, SD#15.2). */
  requestId?: string | null
  onRetry?: () => void
  className?: string
}

/** Inline error card with Try again and request id (SD#12.8). */
export function InlineErrorCard({
  title = "Something went wrong",
  message = "We could not load this content. Try again, or contact support if it keeps happening.",
  requestId,
  onRetry,
  className,
}: InlineErrorCardProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-md border border-err/30 bg-err/10 px-5 py-4 text-fg",
        className
      )}
      data-testid="inline-error-card"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex gap-3">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-err"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <h2 className="text-h4 font-semibold">{title}</h2>
          <p className="text-body text-fg-muted">{message}</p>
          {requestId ? (
            <p className="text-caption text-fg-subtle">
              Request id:{" "}
              <span
                className="font-mono text-fg"
                data-testid="inline-error-request-id"
              >
                {requestId}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            data-testid="inline-error-retry"
          >
            Try again
          </Button>
        </div>
      ) : null}
    </section>
  )
}
