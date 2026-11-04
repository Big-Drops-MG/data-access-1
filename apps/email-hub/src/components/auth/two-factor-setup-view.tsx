"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy } from "lucide-react"
import QRCode from "qrcode"

import { Button } from "@workspace/ui/components/button"

import { authClient } from "@/lib/auth-client"
import {
  formatTotpSecret,
  secretFromTotpUri,
} from "@/lib/two-factor/totp-secret"
import { resolveTwoFactorVerifyError } from "@/lib/two-factor/verify-error"

import { AuthCard } from "./auth-card"
import { OtpCodeInput } from "./otp-code-input"

type TwoFactorSetupViewProps = {
  email: string
  nextPath: string
}

type SetupPhase = "enroll" | "backup"

/** Forced TOTP enrolment: QR + manual key, confirm code, then backup codes. */
export function TwoFactorSetupView({
  email,
  nextPath,
}: TwoFactorSetupViewProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<SetupPhase>("enroll")
  const [totpURI, setTotpURI] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [showManualKey, setShowManualKey] = useState(false)
  const busy = pending || isPending

  const secret = totpURI ? secretFromTotpUri(totpURI) : null

  useEffect(() => {
    let cancelled = false
    async function startEnrolment() {
      setPending(true)
      try {
        const result = await authClient.twoFactor.enable({
          method: "totp",
        })
        if (cancelled) {
          return
        }
        if (result.error) {
          setError(
            resolveTwoFactorVerifyError({
              code: result.error.code,
              message: result.error.message,
            }).description
          )
          setPending(false)
          return
        }
        const data = result.data as {
          totpURI?: string
          backupCodes?: string[]
        } | null
        if (!data?.totpURI) {
          setError("Could not start two-step verification. Try again.")
          setPending(false)
          return
        }
        setTotpURI(data.totpURI)
        setBackupCodes(data.backupCodes ?? [])
        const url = await QRCode.toDataURL(data.totpURI, {
          margin: 1,
          width: 200,
          color: { dark: "#00173A", light: "#FFFFFF" },
        })
        if (!cancelled) {
          setQrDataUrl(url)
        }
      } catch (caught) {
        if (!cancelled) {
          const message =
            caught instanceof Error
              ? caught.message
              : "Could not start two-step verification."
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setPending(false)
        }
      }
    }
    void startEnrolment()
    return () => {
      cancelled = true
    }
  }, [])

  async function verifyEnrolment(nextCode: string) {
    if (nextCode.length !== 6 || busy) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: nextCode,
      })
      if (result.error) {
        setError(
          resolveTwoFactorVerifyError({
            code: result.error.code,
            message: result.error.message,
          }).description
        )
        setCode("")
        setPending(false)
        return
      }
      setPhase("backup")
      setPending(false)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Verification failed. Try again."
      )
      setCode("")
      setPending(false)
    }
  }

  function handleCodeChange(next: string) {
    setCode(next)
    if (next.length === 6) {
      void verifyEnrolment(next)
    }
  }

  async function copySecret() {
    if (!secret) {
      return
    }
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  function downloadBackupCodes() {
    const body = backupCodes.join("\n")
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "emailhub-backup-codes.txt"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function finish() {
    startTransition(() => {
      router.replace(nextPath)
    })
  }

  if (phase === "backup") {
    return (
      <AuthCard title="Save your backup codes" className="max-w-[28rem]">
        <p className="text-center text-sm text-fg-muted">
          Store these codes somewhere safe. Each code works once if you lose
          your authenticator.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm">
          {backupCodes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={downloadBackupCodes}
            data-testid="download-backup-codes"
          >
            Download codes
          </Button>
          <label className="flex items-start gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-border-strong"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            I saved these backup codes and understand they will not be shown
            again.
          </label>
          <Button
            type="button"
            size="lg"
            className="h-11 w-full"
            disabled={!acknowledged || isPending}
            onClick={finish}
            data-testid="backup-codes-continue"
          >
            Continue
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Set up two-step verification" className="max-w-[32rem]">
      <p className="text-center text-sm text-fg-muted">
        2FA is required for every Email Hub account. Scan the code with Google
        Authenticator, Authy or 1Password.
      </p>

      <div className="space-y-3">
        {showManualKey ? (
          <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-sm font-medium text-fg">Enter this key</p>
            <div className="flex items-stretch gap-3">
              <code className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-3 font-mono text-sm leading-relaxed tracking-wide break-all text-fg">
                {secret ? formatTotpSecret(secret) : "—"}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0 self-center"
                disabled={!secret}
                onClick={() => void copySecret()}
                aria-label="Copy secret key"
              >
                <Copy className="size-4" />
              </Button>
            </div>
            {copied ? (
              <p className="text-caption text-ok">Copied</p>
            ) : (
              <p className="text-caption text-fg-subtle">
                This key is shown once. Nobody, including Admins, can view it
                again.
              </p>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL QR from qrcode
                <img
                  src={qrDataUrl}
                  alt="Authenticator QR code"
                  width={200}
                  height={200}
                  className="size-[200px]"
                />
              ) : (
                <div className="flex size-[200px] items-center justify-center text-sm text-fg-muted">
                  {pending ? "Preparing…" : "QR unavailable"}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-center">
          {showManualKey ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => setShowManualKey(false)}
            >
              Show QR code instead
            </Button>
          ) : (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              disabled={!secret}
              onClick={() => setShowManualKey(true)}
            >
              Can&apos;t scan? Click here
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-center text-sm font-medium text-fg">
          Enter the 6-digit code from the app
        </p>
        {error ? (
          <p className="text-center text-sm text-err" role="alert">
            {error}
          </p>
        ) : null}
        <OtpCodeInput
          value={code}
          onChange={handleCodeChange}
          disabled={busy || !totpURI}
          autoFocus={Boolean(totpURI)}
        />
        <Button
          type="button"
          size="lg"
          className="h-11 w-full"
          disabled={busy || code.length !== 6 || !totpURI}
          onClick={() => void verifyEnrolment(code)}
          data-testid="two-factor-setup-verify"
        >
          {busy ? "Verifying…" : "Verify and continue"}
        </Button>
        <p className="text-center text-caption text-fg-subtle">{email}</p>
      </div>
    </AuthCard>
  )
}
