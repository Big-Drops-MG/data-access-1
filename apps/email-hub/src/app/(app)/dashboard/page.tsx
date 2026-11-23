import type { Metadata } from "next"
import { Suspense } from "react"

import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { DashboardEmailRoutes } from "@/features/email-routes/dashboard-email-routes"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function Page() {
  const session = await getSession()
  const canWrite = hasAtLeastRole(session, "operator")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="dashboard-page-loading"
          aria-hidden
        />
      }
    >
      <DashboardPage
        emailRoutes={<DashboardEmailRoutes canWrite={canWrite} />}
      />
    </Suspense>
  )
}
