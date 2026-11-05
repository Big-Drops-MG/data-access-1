import type { Metadata } from "next"
import { Suspense } from "react"

import { TemplatesPage } from "@/features/templates/templates-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Templates",
}

export default async function Page() {
  const session = await getSession()
  const canWrite = hasAtLeastRole(session, "operator")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="templates-list-loading"
          aria-hidden
        />
      }
    >
      <TemplatesPage canWrite={canWrite} />
    </Suspense>
  )
}
