import type { Metadata } from "next"
import { Suspense } from "react"

import { AlertsPage } from "@/features/alerts/alerts-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Alerts",
}

export default async function Page() {
  const session = await getSession()
  const canAck = session ? hasAtLeastRole(session, "operator") : false

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="alerts-list-loading"
          aria-hidden
        />
      }
    >
      <AlertsPage canAck={canAck} currentUserId={session?.id ?? null} />
    </Suspense>
  )
}
