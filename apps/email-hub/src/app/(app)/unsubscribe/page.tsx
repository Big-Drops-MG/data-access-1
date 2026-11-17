import type { Metadata } from "next"
import { Suspense } from "react"

import { UnsubscribeAdminPage } from "@/features/unsubscribe-admin/unsubscribe-admin-page"

export const metadata: Metadata = {
  title: "Unsubscribe",
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="unsubscribe-admin-loading"
          aria-hidden
        />
      }
    >
      <UnsubscribeAdminPage />
    </Suspense>
  )
}
