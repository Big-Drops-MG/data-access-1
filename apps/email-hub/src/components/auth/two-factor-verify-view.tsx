"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { authClient } from "@/lib/auth-client"
import {
  formatLockCountdown,
  remainingLockMs,
} from "@/lib/two-factor/lockout-countdown"
import {
  resolveTwoFactorVerifyError,
  type TwoFactorVerifyError,
} from "@/lib/two-factor/verify-error"
import type { TwoFactorChallengeLockout } from "@/lib/auth/two-factor-challenge"

import { AuthCard } from "./auth-card"
import { OtpCodeInput } from "./otp-code-input"
import { TwoFactorLockoutAlert } from "./two-factor-lockout-alert"

type TwoFactorVerifyViewProps = {
  email: string | null
  nextPath: string
  initialLockout: TwoFactorChallengeLockout | null
}

function lockoutToError(
  lockout: TwoFactorChallengeLockout
): TwoFactorVerifyError {
  if (lockout.kind === "admin_required") {
    return resolveTwoFactorVerifyError({
      code: "TWO_FACTOR_ADMIN_RESET_REQUIRED",
    })
  }
  return resolveTwoFactorVerifyError({
    code: "ACCOUNT_TEMPORARILY_LOCKED",
    lockedUntil: lockout.lockedUntil,
  })
}

/** Login-time TOTP challenge: code, trust device, lockout countdown. */
export function TwoFactorVerifyView({
  email,
  nextPath,
  initialLockout,
}: TwoFactorVerifyViewProps) {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [trustDevice, setTrustDevice] = useState(false)
  const [pending, setPending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<TwoFactorVerifyError | null>(
    initialLockout ? lockoutToError(initialLockout) : null
  )
  const [now, setNow] = useState(() => Date.now())

  const lockedUntil =
    error?.kind === "temporary_lock" ? error.lockedUntil : undefined
  const remaining = useMemo(
    () => remainingLockMs(lockedUntil, new Date(now)),
    [lockedUntil, now]
  )
  const temporaryLockActive = error?.kind === "temporary_lock" && remaining > 0
  const locked = error?.kind === "admin_required" || temporaryLockActive
  const busy = pending || isPending
  const activeError =
    error?.kind === "temporary_lock" && !temporaryLockActive ? null : error

  useEffect(() => {
    if (!lockedUntil || remaining <= 0) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [lockedUntil, remaining])

  async function submitCode(nextCode: string) {
    if (nextCode.length !== 6 || locked || busy) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: nextCode,
        trustDevice,
      })
      if (result.error) {
        const body = result.error as {
          code?: string
          message?: string
          lockedUntil?: string
        }
        setError(
          resolveTwoFactorVerifyError({
            code: body.code ?? result.error.code,
            message: body.message ?? result.error.message,
            lockedUntil: body.lockedUntil,
          })
        )
        setCode("")
        setPending(false)
        return
      }
      startTransition(() => {
        router.replace(nextPath)
      })
    } catch (caught) {
      const body =
        caught && typeof caught === "object"
          ? (caught as {
              code?: string
              message?: string
              lockedUntil?: string
            })
          : {}
      setError(resolveTwoFactorVerifyError(body))
      setCode("")
      setPending(false)
    }
  }

  function handleCodeChange(next: string) {
    setCode(next)
    if (next.length === 6) {
      void submitCode(next)
    }
  }

  const subtitle = email
    ? `Open your authenticator app for ${email}.`
    : "Open your authenticator app."

  return (
    <AuthCard title="Enter your 6-digit code">
      <p className="text-center text-sm text-fg-muted">
        {email ? (
          <>
            Open your authenticator app for{" "}
            <span className="font-semibold text-fg">{email}</span>.
          </>
        ) : (
          subtitle
        )}
      </p>

      {activeError &&
      (activeError.kind === "temporary_lock" ||
        activeError.kind === "admin_required") ? (
        <TwoFactorLockoutAlert error={activeError} />
      ) : null}

      {activeError &&
      activeError.kind !== "temporary_lock" &&
      activeError.kind !== "admin_required" ? (
        <p className="text-center text-sm text-err" role="alert">
          {activeError.description}
        </p>
      ) : null}

      <OtpCodeInput
        value={code}
        onChange={handleCodeChange}
        disabled={locked || busy}
        autoFocus={!locked}
      />

      <label className="flex items-center justify-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          className="size-4 rounded border-border-strong"
          checked={trustDevice}
          disabled={locked || busy}
          onChange={(event) => setTrustDevice(event.target.checked)}
        />
        Remember this device for 30 days
      </label>

      <Button
        type="button"
        size="lg"
        className="h-11 w-full"
        disabled={locked || busy || code.length !== 6}
        onClick={() => void submitCode(code)}
        data-testid="two-factor-verify-submit"
      >
        {temporaryLockActive
          ? `Locked (${formatLockCountdown(remaining)})`
          : locked
            ? "Locked"
            : busy
              ? "Verifying…"
              : "Verify"}
      </Button>
    </AuthCard>
  )
}
