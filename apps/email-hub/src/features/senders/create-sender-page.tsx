"use client"

import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { SenderForm } from "@/features/senders/sender-form"

export function CreateSenderPage() {
  const router = useRouter()

  return (
    <div className="space-y-6" data-testid="senders-create-page">
      <PageHeader
        title="New sender"
        breadcrumbs={[
          { label: "Senders", href: "/senders" },
          { label: "New sender" },
        ]}
      />
      <SenderForm
        mode="create"
        onSuccess={(sender) => {
          router.push(`/senders/${encodeURIComponent(sender.id)}`)
        }}
      />
    </div>
  )
}
