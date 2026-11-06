"use client"

import { useRouter } from "next/navigation"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { SendForm } from "@/features/sends/send-form"
import { useSendFormOptions } from "@/features/sends/use-send-form-options"
import { isApiError } from "@/lib/api-client"

export function CreateSendPage() {
  const router = useRouter()
  const options = useSendFormOptions()

  return (
    <div className="space-y-6" data-testid="sends-create-page">
      <PageHeader
        title="New send"
        breadcrumbs={[
          { label: "Sends", href: "/sends" },
          { label: "New send" },
        ]}
      />

      {options.error ? (
        <InlineErrorCard
          message={
            isApiError(options.error)
              ? options.error.message
              : "Could not load send options."
          }
          requestId={isApiError(options.error) ? options.error.requestId : null}
          onRetry={options.refetch}
        />
      ) : null}

      {options.isPending && !options.error ? (
        <div
          className="h-64 animate-pulse rounded-xl bg-surface-2"
          data-testid="sends-create-loading"
          aria-hidden
        />
      ) : null}

      {!options.isPending && !options.error ? (
        <SendForm
          mode="create"
          templates={options.templates}
          senders={options.senders}
          offers={options.offers}
          onSaved={(send) => {
            router.push(`/sends/${encodeURIComponent(send.id)}`)
          }}
        />
      ) : null}
    </div>
  )
}
