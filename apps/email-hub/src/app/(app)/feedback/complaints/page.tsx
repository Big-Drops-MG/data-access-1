import type { Metadata } from "next"
import { Suspense } from "react"

import { FeedbackPage } from "@/features/feedback/feedback-page"
import { getSession } from "@/lib/auth"

export const metadata: Metadata = {
  title: "Complaints",
}

export default async function Page() {
  const session = await getSession()

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="feedback-list-loading"
          aria-hidden
        />
      }
    >
      <FeedbackPage currentUserId={session?.id ?? null} />
    </Suspense>
  )
}
