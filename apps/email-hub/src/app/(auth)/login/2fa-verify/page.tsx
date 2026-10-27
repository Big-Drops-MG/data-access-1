import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { TwoFactorVerifyView } from "@/components/auth/two-factor-verify-view"
import { getSession } from "@/lib/auth"
import { getTwoFactorChallengeState } from "@/lib/auth/two-factor-challenge"
import { safeNextPath } from "@/lib/login/safe-next-path"

export const metadata: Metadata = {
  title: "Verify · EmailHub",
}

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

/** /login/2fa-verify — TOTP challenge after Google SSO (T-038). */
export default async function TwoFactorVerifyPage({ searchParams }: PageProps) {
  const params = await searchParams
  const nextPath = safeNextPath(firstParam(params.next))
  const session = await getSession()
  if (session?.twoFactorEnabled) {
    redirect(nextPath)
  }
  if (session && !session.twoFactorEnabled) {
    redirect(`/login/2fa-setup?next=${encodeURIComponent(nextPath)}`)
  }

  const challenge = await getTwoFactorChallengeState()

  return (
    <TwoFactorVerifyView
      email={challenge.email}
      nextPath={nextPath}
      initialLockout={challenge.lockout}
    />
  )
}
