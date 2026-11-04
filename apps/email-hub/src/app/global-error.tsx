"use client"

import { useSyncExternalStore } from "react"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { readClientRequestId } from "@/lib/client-request-id"

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

function subscribe() {
  return () => undefined
}

/** Root shell error UI (SD#12.8 / SD#15.6): own html/body, request id + Try again. */
export default function GlobalError({ reset }: GlobalErrorProps) {
  const requestId = useSyncExternalStore(
    subscribe,
    readClientRequestId,
    () => null
  )

  return (
    <html lang="en">
      <body className="min-h-svh bg-bg text-fg antialiased">
        <main className="mx-auto flex min-h-svh w-full max-w-[1440px] items-center px-6 py-10">
          <InlineErrorCard
            className="w-full max-w-xl"
            title="Something went wrong"
            message="The app shell failed to render. Try again, or contact support with the request id if it keeps happening."
            requestId={requestId}
            onRetry={reset}
          />
        </main>
      </body>
    </html>
  )
}
