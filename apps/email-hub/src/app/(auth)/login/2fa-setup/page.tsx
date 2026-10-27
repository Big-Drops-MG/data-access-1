import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { TwoFactorSetupView } from "@/components/auth/two-factor-setup-view"
import { getSession, signOut } from "@/lib/auth"
import { userHasTwoFactorEnrolled } from "@/lib/auth/two-factor-enrollment"
import { buildLoginPath } from "@/lib/login/login-path"
import { safeNextPath } from "@/lib/login/safe-next-path"

export const metadata: Metadata = {
  title: "Set up 2FA · EmailHub",
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

/** /login/2fa-setup — forced TOTP enrolment (T-038). */
export default async function TwoFactorSetupPage({ searchParams }: PageProps) {
  const params = await searchParams
  const nextPath = safeNextPath(firstParam(params.next))
  const session = await getSession()

  if (!session) {
    redirect(buildLoginPath({ next: nextPath }))
  }
  if (session.twoFactorEnabled) {
    redirect(nextPath)
  }
  // Enrolled users must never see QR/keys — re-auth into TOTP verify only.
  if (await userHasTwoFactorEnrolled(session.id)) {
    await signOut()
    redirect(buildLoginPath({ next: nextPath }))
  }

  return <TwoFactorSetupView email={session.email} nextPath={nextPath} />
}
