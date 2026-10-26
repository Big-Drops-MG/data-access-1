import { Ban } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import type { LoginErrorContent } from "@/lib/login/login-error"

type LoginErrorAlertProps = {
  error: LoginErrorContent
  className?: string
}

/** Generic login dead-end alert (unprovisioned / SSO failed). */
export function LoginErrorAlert({ error, className }: LoginErrorAlertProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-err/35 bg-err/10 px-3.5 py-3 text-left",
        className
      )}
      role="alert"
      aria-live="assertive"
      data-testid="login-error-alert"
      data-error-code={error.code}
    >
      <Ban
        className="mt-0.5 size-4 shrink-0 text-err"
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-fg">{error.title}</p>
        <p className="text-sm text-fg-muted">{error.description}</p>
      </div>
    </div>
  )
}
