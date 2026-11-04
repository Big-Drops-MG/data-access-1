import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth"

/** Site root: send anonymous users to login; signed-in users to the app. */
export default async function RootPage() {
  let session = null
  try {
    session = await getSession()
  } catch {
    redirect("/login")
  }

  if (!session) {
    redirect("/login")
  }
  if (!session.twoFactorEnabled) {
    redirect("/login/2fa-setup")
  }
  if (!session.jobTitle) {
    redirect("/onboarding")
  }

  redirect("/dashboard")
}
