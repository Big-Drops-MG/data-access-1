import type { Metadata } from "next"
import { Suspense } from "react"

import { FeedbackResponsesPage } from "@/features/feedback/feedback-responses-page"
import { getSession } from "@/lib/auth"

export const metadata: Metadata = {
  title: "Feedback",
}

export default async function Page() {
  const session = await getSession()

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="feedback-responses-list-loading"
          aria-hidden
        />
      }
    >
      <FeedbackResponsesPage currentUserId={session?.id ?? null} />
    </Suspense>
  )
}
