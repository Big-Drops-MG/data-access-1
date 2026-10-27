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

type VerifyMode = "totp" | "backup"

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

export function TwoFactorVerifyView({
  email,
  nextPath,
  initialLockout,
}: TwoFactorVerifyViewProps) {
  const router = useRouter()
  const [mode, setMode] = useState<VerifyMode>("totp")
  const [code, setCode] = useState("")
  const [backupCode, setBackupCode] = useState("")
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
  const canSubmitTotp = code.length === 6
  const canSubmitBackup = backupCode.trim().length >= 8

  useEffect(() => {
    if (!lockedUntil || remaining <= 0) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [lockedUntil, remaining])

  async function completeVerify(result: {
    error?: { code?: string; message?: string } | null
  }) {
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
      setBackupCode("")
      setPending(false)
      return
    }
    startTransition(() => {
      router.replace(nextPath)
    })
  }

  async function submitTotp(nextCode: string) {
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
      await completeVerify(result)
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

  async function submitBackup() {
    const next = backupCode.trim()
    if (next.length < 8 || locked || busy) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await authClient.twoFactor.verifyBackupCode({
        code: next,
        trustDevice,
      })
      await completeVerify(result)
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
      setBackupCode("")
      setPending(false)
    }
  }

  function handleCodeChange(next: string) {
    setCode(next)
    if (next.length === 6) {
      void submitTotp(next)
    }
  }

  function switchMode(next: VerifyMode) {
    setMode(next)
    setError(null)
    setCode("")
    setBackupCode("")
  }

  const subtitle = email
    ? `Open your authenticator app for ${email}.`
    : "Open your authenticator app."

  return (
    <AuthCard
      title={
        mode === "totp" ? "Enter your 6-digit code" : "Enter a backup code"
      }
    >
      <p className="text-center text-sm text-fg-muted">
        {mode === "totp" ? (
          email ? (
            <>
              Open your authenticator app for{" "}
              <span className="font-semibold text-fg">{email}</span>.
            </>
          ) : (
            subtitle
          )
        ) : (
          "Use one of the one-time backup codes from when you enrolled."
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

      {mode === "totp" ? (
        <OtpCodeInput
          value={code}
          onChange={handleCodeChange}
          disabled={locked || busy}
          autoFocus={!locked}
        />
      ) : (
        <label className="grid gap-2 text-sm text-fg-muted">
          <span className="sr-only">Backup code</span>
          <input
            type="text"
            autoComplete="one-time-code"
            spellCheck={false}
            className="h-11 w-full rounded-md border border-border-strong bg-bg px-3 font-mono text-fg"
            value={backupCode}
            disabled={locked || busy}
            onChange={(event) => setBackupCode(event.target.value)}
            data-testid="two-factor-backup-code"
          />
        </label>
      )}

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
        disabled={
          locked ||
          busy ||
          (mode === "totp" ? !canSubmitTotp : !canSubmitBackup)
        }
        onClick={() =>
          void (mode === "totp" ? submitTotp(code) : submitBackup())
        }
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

      <p className="text-center text-sm text-fg-muted">
        <button
          type="button"
          className="underline underline-offset-2 hover:text-fg"
          disabled={locked || busy}
          onClick={() => switchMode(mode === "totp" ? "backup" : "totp")}
          data-testid="two-factor-verify-mode-toggle"
        >
          {mode === "totp"
            ? "Use a backup code instead"
            : "Use authenticator code instead"}
        </button>
      </p>
    </AuthCard>
  )
}
