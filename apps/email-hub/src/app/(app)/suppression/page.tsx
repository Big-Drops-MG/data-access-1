import type { Metadata } from "next"
import { Suspense } from "react"

import { SuppressionPage } from "@/features/suppression/suppression-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Suppression",
}

export default async function Page() {
  const session = await getSession()
  const canAdd = hasAtLeastRole(session, "operator")
  const canRemove = hasAtLeastRole(session, "admin")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="suppressions-list-loading"
          aria-hidden
        />
      }
    >
      <SuppressionPage canAdd={canAdd} canRemove={canRemove} />
    </Suspense>
  )
}
