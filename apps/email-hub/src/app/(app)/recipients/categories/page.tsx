import type { Metadata } from "next"
import { Suspense } from "react"

import { RecipientsCategoriesPage } from "@/features/recipients/recipients-categories-page"

export const metadata: Metadata = {
  title: "Recipient categories",
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="recipients-categories-loading"
          aria-hidden
        />
      }
    >
      <RecipientsCategoriesPage />
    </Suspense>
  )
}
