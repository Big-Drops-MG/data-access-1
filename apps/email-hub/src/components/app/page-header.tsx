import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

export type PageHeaderBreadcrumb = {
  label: string
  href?: string
}

type PageHeaderProps = {
  title: string
  description?: string
  breadcrumbs?: PageHeaderBreadcrumb[]
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className
      )}
      data-testid="page-header"
    >
      <div className="min-w-0 space-y-2">
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
        <div className="space-y-1">
          <h1 className="text-h2 font-semibold tracking-tight text-fg">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-body text-fg-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
