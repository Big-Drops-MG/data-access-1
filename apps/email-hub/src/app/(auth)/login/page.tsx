import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { LoginView } from "@/components/auth/login-view"
import { getSession, signOut } from "@/lib/auth"
import { userHasTwoFactorEnrolled } from "@/lib/auth/two-factor-enrollment"
import { resolveLoginError } from "@/lib/login/login-error"
import { safeNextPath } from "@/lib/login/safe-next-path"

export const metadata: Metadata = {
  title: "Sign in · EmailHub",
}

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[]
    error?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

/** /login — Google SSO entry + generic dead ends (T-031). */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const callbackURL = safeNextPath(firstParam(params.next))
  const error = resolveLoginError(firstParam(params.error))
  let session = null
  try {
    session = await getSession()
  } catch {
    // DB/env misconfigured — still render the login form.
  }

  if (session?.twoFactorEnabled) {
    redirect(callbackURL)
  }
  if (session && !session.twoFactorEnabled) {
    // Stale session flag but already enrolled → force SSO → TOTP verify (no QR).
    if (await userHasTwoFactorEnrolled(session.id)) {
      await signOut()
      return <LoginView callbackURL={callbackURL} error={error} />
    }
    redirect(`/login/2fa-setup?next=${encodeURIComponent(callbackURL)}`)
  }

  return <LoginView callbackURL={callbackURL} error={error} />
}
