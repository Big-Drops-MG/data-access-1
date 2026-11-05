import type { Metadata } from "next"
import { Suspense } from "react"

import { SendsPage } from "@/features/sends/sends-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Sends",
}

export default async function Page() {
  const session = await getSession()
  const canWrite = hasAtLeastRole(session, "operator")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="sends-list-loading"
          aria-hidden
        />
      }
    >
      <SendsPage canWrite={canWrite} />
    </Suspense>
  )
}
