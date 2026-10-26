import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { BrandMark } from "./brand-mark"

type AuthCardProps = {
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Centered auth shell: brand, title, body, optional footer. */
export function AuthCard({
  title,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <section
      className={cn(
        "w-full max-w-[26rem] rounded-xl border border-border bg-surface px-8 py-9 shadow-sm",
        className
      )}
      data-testid="auth-card"
    >
      <header className="mb-6 space-y-4 text-center">
        <BrandMark />
        <h1 className="text-h2 font-bold tracking-tight text-fg">{title}</h1>
      </header>
      <div className="space-y-4">{children}</div>
      {footer ? (
        <footer className="mt-5 text-center text-caption text-fg-subtle">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}
