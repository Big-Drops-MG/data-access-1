import type { Metadata } from "next"
import { Suspense } from "react"

import { RecipientsPage } from "@/features/recipients/recipients-page"

export const metadata: Metadata = {
  title: "Recipients",
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="recipients-list-loading"
          aria-hidden
        />
      }
    >
      <RecipientsPage />
    </Suspense>
  )
}
