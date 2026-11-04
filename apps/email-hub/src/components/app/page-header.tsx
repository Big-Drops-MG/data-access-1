import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

export type PageHeaderBreadcrumb = {
  label: string
  href?: string
}

type PageHeaderProps = {
  title: string
  description?: string
  /** Rendered beside the title (for example a status badge). */
  titleBadge?: React.ReactNode
  /** Secondary line under the title. */
  meta?: React.ReactNode
  breadcrumbs?: PageHeaderBreadcrumb[]
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  titleBadge,
  meta,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("space-y-2", className)} data-testid="page-header">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <li
                  key={`${crumb.label}-${index}`}
                  className="flex items-center gap-1.5"
                >
                  {index > 0 ? (
                    <span aria-hidden className="text-fg-subtle">
                      /
                    </span>
                  ) : null}
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="text-link hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(isLast && "font-medium text-fg")}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-h2 font-semibold tracking-tight text-fg">
            {title}
          </h1>
          {titleBadge}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>

      {meta ? <p className="text-body text-fg-muted">{meta}</p> : null}
      {description ? (
        <p className="max-w-3xl text-body text-fg-muted">{description}</p>
      ) : null}
    </header>
  )
}
