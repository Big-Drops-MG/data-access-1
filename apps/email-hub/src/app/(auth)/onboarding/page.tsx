import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { OnboardingView } from "@/components/auth/onboarding-view"
import { getSession } from "@/lib/auth"
import { buildLoginPath } from "@/lib/login/login-path"
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/login/safe-next-path"

export const metadata: Metadata = {
  title: "Choose your role",
}

/** Post-2FA gate: collect job title before the app shell. */
export default async function OnboardingPage() {
  const session = await getSession()

  if (!session) {
    redirect(buildLoginPath({ next: "/onboarding" }))
  }
  if (!session.twoFactorEnabled) {
    redirect("/login/2fa-setup?next=%2Fonboarding")
  }
  if (session.jobTitle) {
    redirect(DEFAULT_POST_LOGIN_PATH)
  }

  return <OnboardingView />
}
