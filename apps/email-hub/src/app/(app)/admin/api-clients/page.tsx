import type { Metadata } from "next"
import { Suspense } from "react"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { ApiClientsPage } from "@/features/api-clients/api-clients-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "API clients",
}

export default async function Page() {
  const access = await requireRoleForPage("admin", {
    nextPath: "/admin/api-clients",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="api-clients-list-loading"
          aria-hidden
        />
      }
    >
      <ApiClientsPage />
    </Suspense>
  )
}
