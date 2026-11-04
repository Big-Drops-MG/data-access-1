import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { BrandMark } from "./brand-mark"

type AuthCardProps = {
  title: string
  /** Supporting copy under the title (same header column). */
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Auth surface with a fixed hierarchy:
 * equal card padding → brand → title/description → body → optional footer.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <section
      className={cn(
        "w-full max-w-[26rem] rounded-2xl border border-border bg-surface p-8 shadow-sm",
        className
      )}
      data-testid="auth-card"
    >
      <header className="flex flex-col items-center gap-6 text-center">
        <BrandMark />
        <div className="flex w-full flex-col gap-2">
          <h1 className="text-h2 font-bold tracking-tight text-fg">{title}</h1>
          {description ? (
            <div className="text-sm leading-relaxed text-fg-muted">
              {description}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-6">{children}</div>

      {footer ? (
        <footer className="mt-8 border-t border-border pt-6 text-center text-sm text-fg-muted">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}
