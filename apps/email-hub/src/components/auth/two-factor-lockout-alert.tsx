import { Lock } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import type { TwoFactorVerifyError } from "@/lib/two-factor/verify-error"

type TwoFactorLockoutAlertProps = {
  error: TwoFactorVerifyError
  className?: string
}

/** Lockout / admin-reset dead-end alert for the verify page. */
export function TwoFactorLockoutAlert({
  error,
  className,
}: TwoFactorLockoutAlertProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-err/35 bg-err/10 px-3.5 py-3 text-left",
        className
      )}
      role="alert"
      aria-live="assertive"
      data-testid="two-factor-lockout-alert"
      data-error-kind={error.kind}
    >
      <Lock
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
