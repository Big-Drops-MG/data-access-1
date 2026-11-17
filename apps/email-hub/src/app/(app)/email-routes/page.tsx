import type { Metadata } from "next"
import { Suspense } from "react"

import { EmailRoutesPage } from "@/features/email-routes/email-routes-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Email routes",
}

export default async function Page() {
  const session = await getSession()
  const canWrite = hasAtLeastRole(session, "operator")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="email-routes-list-loading"
          aria-hidden
        />
      }
    >
      <EmailRoutesPage canWrite={canWrite} />
    </Suspense>
  )
}
