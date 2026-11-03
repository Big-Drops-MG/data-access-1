import type { Metadata } from "next"
import { Suspense } from "react"

import { SendersPage } from "@/features/senders/senders-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Senders",
}

export default async function Page() {
  const session = await getSession()
  const canWrite = hasAtLeastRole(session, "operator")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="senders-list-loading"
          aria-hidden
        />
      }
    >
      <SendersPage canWrite={canWrite} />
    </Suspense>
  )
}
