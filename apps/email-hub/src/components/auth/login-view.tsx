"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth-client"
import type { LoginErrorContent } from "@/lib/login/login-error"
import { loginDomainHint } from "@/lib/login/login-error"
import { buildLoginPath } from "@/lib/login/login-path"

import { AuthCard } from "./auth-card"
import { GoogleSignInButton } from "./google-sign-in-button"
import { LoginErrorAlert } from "./login-error-alert"

type LoginViewProps = {
  /** Safe post-login path (already sanitised by the page). */
  callbackURL: string
  error: LoginErrorContent | null
}

/**
 * Login controller + view: starts Google SSO and shows generic dead-end errors.
 */
export function LoginView({ callbackURL, error }: LoginViewProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const busy = pending || isPending
  const domain = loginDomainHint()
  const errorCallbackURL = buildLoginPath({ next: callbackURL })
  const ssoFailedPath = buildLoginPath({
    next: callbackURL,
    error: "sso_failed",
  })

  async function handleGoogleSignIn() {
    setPending(true)
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL,
      })
      if (result?.error) {
        startTransition(() => {
          router.replace(ssoFailedPath)
        })
        setPending(false)
      }
    } catch {
      startTransition(() => {
        router.replace(ssoFailedPath)
      })
      setPending(false)
    }
  }

  return (
    <AuthCard
      title="Team sign in"
      footer={
        <p>
          Sign in with your{" "}
          <span className="font-semibold text-fg-muted">{domain}</span> Google
          account.
        </p>
      }
    >
      {error ? <LoginErrorAlert error={error} /> : null}
      <GoogleSignInButton onClick={handleGoogleSignIn} pending={busy} />
    </AuthCard>
  )
}
