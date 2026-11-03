"use client"

import { useSyncExternalStore } from "react"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { readClientRequestId } from "@/lib/client-request-id"

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

function subscribe() {
  return () => undefined
}

/** Segment error UI (SD#12.8 / SD#15.6): request id + Try again. */
export default function ErrorPage({ reset }: ErrorPageProps) {
  const requestId = useSyncExternalStore(
    subscribe,
    readClientRequestId,
    () => null
  )

  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-[1440px] items-center px-6 py-10">
      <InlineErrorCard
        className="w-full max-w-xl"
        title="Something went wrong"
        message="This page hit an unexpected error. Try again, or contact support with the request id if it keeps happening."
        requestId={requestId}
        onRetry={reset}
      />
    </main>
  )
}
