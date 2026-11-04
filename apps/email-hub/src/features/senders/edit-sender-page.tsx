"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { fetchSender } from "@/features/senders/api"
import { SenderForm } from "@/features/senders/sender-form"
import { isApiError } from "@/lib/api-client"
import { detailQueryKey } from "@/lib/query-keys"

type EditSenderPageProps = {
  senderId: string
}

export function EditSenderPage({ senderId }: EditSenderPageProps) {
  const router = useRouter()
  const senderQuery = useQuery({
    queryKey: detailQueryKey("senders", senderId),
    queryFn: () => fetchSender(senderId),
  })

  const sender = senderQuery.data

  return (
    <div className="space-y-6" data-testid="senders-edit-page">
      <PageHeader
        title={sender?.from_name ?? "Edit sender"}
        breadcrumbs={[
          { label: "Senders", href: "/senders" },
          { label: sender?.from_email ?? "Edit" },
        ]}
      />

      {senderQuery.isError ? (
        <InlineErrorCard
          message={
            isApiError(senderQuery.error)
              ? senderQuery.error.message
              : "Could not load sender."
          }
          requestId={
            isApiError(senderQuery.error) ? senderQuery.error.requestId : null
          }
          onRetry={() => {
            void senderQuery.refetch()
          }}
        />
      ) : null}

      {senderQuery.isPending && !sender ? (
        <div
          className="h-64 animate-pulse rounded-xl bg-surface-2"
          data-testid="senders-edit-loading"
          aria-hidden
        />
      ) : null}

      {sender ? (
        <SenderForm
          key={`${sender.id}-${sender.version}`}
          mode="edit"
          initial={sender}
          onSuccess={() => {
            router.push("/senders")
          }}
        />
      ) : null}
    </div>
  )
}
