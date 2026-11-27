import type { Metadata } from "next"
import { Suspense } from "react"

import { DashboardPage } from "@/features/dashboard/dashboard-page"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default function Page() {
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
      <DashboardPage />
    </Suspense>
  )
}
