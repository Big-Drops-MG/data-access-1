"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { fetchSend } from "@/features/sends/api"
import { SendForm } from "@/features/sends/send-form"
import { SendLockedDialog } from "@/features/sends/send-locked-dialog"
import { useSendFormOptions } from "@/features/sends/use-send-form-options"
import { isApiError } from "@/lib/api-client"
import { detailQueryOptions } from "@/lib/query-options"

type EditSendPageProps = {
  sendId: string
}

export function EditSendPage({ sendId }: EditSendPageProps) {
  const router = useRouter()
  const sendQuery = useQuery(
    detailQueryOptions("sends", sendId, () => fetchSend(sendId))
  )
  const options = useSendFormOptions()
  const [lockedOpen, setLockedOpen] = useState(false)

  const send = sendQuery.data
  const loadError = sendQuery.error ?? options.error
  const isLocked = send != null && send.status !== "draft"
  const detailHref = `/sends/${encodeURIComponent(sendId)}`

  return (
    <div className="space-y-6" data-testid="sends-edit-page">
      <PageHeader
        title={send?.name ?? "Edit send"}
        breadcrumbs={[
          { label: "Sends", href: "/sends" },
          { label: send?.name ?? "Send", href: detailHref },
          { label: "Edit" },
        ]}
      />

      {loadError ? (
        <InlineErrorCard
          message={
            isApiError(loadError) ? loadError.message : "Could not load send."
          }
          requestId={isApiError(loadError) ? loadError.requestId : null}
          onRetry={() => {
            void sendQuery.refetch()
            options.refetch()
          }}
        />
      ) : null}

      {!loadError && (sendQuery.isPending || options.isPending) ? (
        <div
          className="h-64 animate-pulse rounded-xl bg-surface-2"
          data-testid="sends-edit-loading"
          aria-hidden
        />
      ) : null}

      {send && !isLocked && !options.isPending && !options.error ? (
        <SendForm
          key={`${send.id}-${send.version}`}
          mode="edit"
          initial={send}
          templates={options.templates}
          senders={options.senders}
          offers={options.offers}
          onLocked={() => setLockedOpen(true)}
          onSaved={() => {
            router.push(detailHref)
          }}
        />
      ) : null}

      <SendLockedDialog
        open={isLocked || lockedOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLockedOpen(false)
            router.replace(detailHref)
          }
        }}
      />
    </div>
  )
}
