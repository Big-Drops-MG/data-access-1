import type { Metadata } from "next"
import { Suspense } from "react"

import { DomainsPage } from "@/features/domains/domains-page"

export const metadata: Metadata = {
  title: "Domains",
}

export default function Page() {
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
      <DomainsPage />
    </Suspense>
  )
}
