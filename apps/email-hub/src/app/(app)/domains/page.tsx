import type { Metadata } from "next"
import { Suspense } from "react"

import { DomainsPage } from "@/features/domains/domains-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Domains",
}

export default async function Page() {
  const session = await getSession()
  const canCreateDomain = hasAtLeastRole(session, "admin")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="domains-list-loading"
          aria-hidden
        />
      }
    >
      <DomainsPage canCreateDomain={canCreateDomain} />
    </Suspense>
  )
}
