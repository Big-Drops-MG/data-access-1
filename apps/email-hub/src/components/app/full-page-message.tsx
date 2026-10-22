import Link from "next/link"

import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type FullPageMessageProps = {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
  className?: string
  testId?: string
}

/** Full-page status message used for 403 and 404 (SD#12.8). */
export function FullPageMessage({
  title,
  description,
  actionHref = "/dashboard",
  actionLabel = "Go to Dashboard",
  className,
  testId = "full-page-message",
}: FullPageMessageProps) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center",
        className
      )}
      data-testid={testId}
    >
      <h1 className="text-h2 font-semibold tracking-tight text-fg">{title}</h1>
      <p className="text-body text-fg-muted">{description}</p>
      <Link
        href={actionHref}
        className={buttonVariants({ variant: "default" })}
        data-testid={`${testId}-action`}
      >
        {actionLabel}
      </Link>
    </main>
  )
}

export function ForbiddenPage() {
  return (
    <FullPageMessage
      title="You don't have access"
      description="Your role cannot open this page. Ask an admin if you think that is a mistake."
      testId="forbidden-page"
    />
  )
}

export function NotFoundPage() {
  return (
    <FullPageMessage
      title="Page not found"
      description="That link does not match anything in Email Hub."
      testId="not-found-page"
    />
  )
}
